// npx hardhat run testArcology/testDispatcher.js --network TestnetInfo

import { network } from "hardhat";
import frontendUtil from '@arcologynetwork/frontend-util/utils/util.js';
import { expect } from "chai";

async function deployContracts() {
    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });

    console.log("   Deploying fresh contracts...");
    
    // Get signers
    const accounts = await ethers.getSigners();
    const keeper = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];

    // Generate deterministic, sorted token addresses
    const addrs = [
        ethers.utils.getAddress(ethers.utils.id("token0").slice(0, 42)),
        ethers.utils.getAddress(ethers.utils.id("token1").slice(0, 42)),
        ethers.utils.getAddress(ethers.utils.id("token2").slice(0, 42))
    ].sort();
    
    const token0 = addrs[0];
    const token1 = addrs[1];
    const token2 = addrs[2];

    // Generate router addresses
    const router1 = ethers.Wallet.createRandom();
    const router2 = ethers.Wallet.createRandom();

    // Deploy MockBatchSolver
    const MockSolverFactory = await ethers.getContractFactory("MockBatchSolver");
    const mockSolver = await MockSolverFactory.deploy();
    await mockSolver.waitForDeployment(); // Using v5 mockSolver.waitForDeployment()

    // Deploy Dispatcher
    const DispatcherFactory = await ethers.getContractFactory("Dispatcher");
    const dispatcher = await DispatcherFactory.deploy(mockSolver.address, keeper.address); // Using v5 .address
    await dispatchermockSolver.waitForDeployment();

    // Get IntentStruct factory
    const IntentStructFactory = await ethers.getContractFactory("IntentStruct");

    /**
     * Helper function to create a valid intent object.
     * Defined inside here to have access to user1, token0, etc.
     */
    async function _createValidIntent(overrides = {}) {
        const block = await ethers.provider.getBlock("latest");
        const defaults = {
            user: user1.address,
            token0: token0,
            token1: token1,
            router: router1.address,
            amount: ethers.utils.parseEther("100"),
            deadline: block.timestamp + 3600,
            v: 27,
            r: ethers.utils.hexZeroPad(ethers.utils.hexlify(1), 32),
            s: ethers.utils.hexZeroPad(ethers.utils.hexlify(2), 32)
        };
        return { ...defaults, ...overrides };
    }

    console.log("   Contracts deployed.");
    // Return all contracts and the helper
    return { 
        dispatcher, 
        mockSolver, 
        keeper, 
        user1, 
        user2, 
        token0, 
        token1, 
        token2, 
        router1, 
        router2, 
        IntentStructFactory, 
        _createValidIntent 
    };
}


// --- Individual Test Cases ---

async function test_AddIntent_Success() {
    console.log("Running: test_AddIntent_Success...");
    const { dispatcher, user1, IntentStructFactory, _createValidIntent } = await deployContracts();

    const intentContainerAddr = await dispatcher.intentContainer();
    const intentContainer = IntentStructFactory.attach(intentContainerAddr);

    expect(await intentContainer.fullLength()).to.equal(0);

    const intent = await _createValidIntent();

    const txs = [];
    txs.push(frontendUtil.generateTx(function([dispatcher, user, intent]) {
        return dispatcher.connect(user).addIntent(intent);
    }, dispatcher, user1, intent));
    await frontendUtil.waitingTxs(txs);

    expect(await intentContainer.fullLength()).to.equal(1);

    const storedIntent = await intentContainer.get(0);
    expect(storedIntent.user).to.equal(intent.user);
    expect(storedIntent.token0).to.equal(intent.token0);
    expect(storedIntent.token1).to.equal(intent.token1);
    expect(storedIntent.amount).to.equal(intent.amount);
    console.log("✅ test_AddIntent_Success Passed");
}

async function test_Dispatch_NoIntents() {
    console.log("Running: test_Dispatch_NoIntents...");
    const { dispatcher, mockSolver, keeper, IntentStructFactory } = await deployContracts();

    const intentContainerAddr = await dispatcher.intentContainer();
    const intentContainer = IntentStructFactory.attach(intentContainerAddr);

    expect(await intentContainer.fullLength()).to.equal(0);

    const txs = [];
    txs.push(frontendUtil.generateTx(function([dispatcher, user]) {
        return dispatcher.connect(user).dispatch();
    }, dispatcher, keeper));
    await frontendUtil.waitingTxs(txs);

    expect(await mockSolver.callCount()).to.equal(0);
    console.log("✅ test_Dispatch_NoIntents Passed");
}

async function test_Dispatch_ContainerSwapLogic() {
    console.log("Running: test_Dispatch_ContainerSwapLogic...");
    const { dispatcher, user1, keeper, IntentStructFactory, _createValidIntent } = await deployContracts();

    const intent = await _createValidIntent();
    
    const txs1 = [];
    txs1.push(frontendUtil.generateTx(function([dispatcher, user, intent]) {
        return dispatcher.connect(user).addIntent(intent);
    }, dispatcher, user1, intent));
    await frontendUtil.waitingTxs(txs1);

    const oldIntentContainerAddr = await dispatcher.intentContainer();
    const oldProcessingContainerAddr = await dispatcher.processingContainer();

    const oldIntentContainer = IntentStructFactory.attach(oldIntentContainerAddr);
    const oldProcessingContainer = IntentStructFactory.attach(oldProcessingContainerAddr);

    expect(await oldIntentContainer.fullLength()).to.equal(1);
    expect(await oldProcessingContainer.fullLength()).to.equal(0);

    const txs2 = [];
    txs2.push(frontendUtil.generateTx(function([dispatcher, user]) {
        return dispatcher.connect(user).dispatch();
    }, dispatcher, keeper));
    await frontendUtil.waitingTxs(txs2);

    const newIntentContainerAddr = await dispatcher.intentContainer();
    const newProcessingContainerAddr = await dispatcher.processingContainer();

    expect(newIntentContainerAddr).to.equal(oldProcessingContainerAddr);
    expect(newProcessingContainerAddr).to.not.equal(oldProcessingContainerAddr);
    expect(newProcessingContainerAddr).to.not.equal(oldIntentContainerAddr);

    const newIntentContainer = IntentStructFactory.attach(newIntentContainerAddr);
    const newProcessingContainer = IntentStructFactory.attach(newProcessingContainerAddr);
    expect(await newIntentContainer.fullLength()).to.equal(0);
    expect(await newProcessingContainer.fullLength()).to.equal(0);
    console.log("✅ test_Dispatch_ContainerSwapLogic Passed");
}

async function test_Dispatch_OneIntent_0to1() {
    console.log("Running: test_Dispatch_OneIntent_0to1...");
    const { dispatcher, mockSolver, keeper, user1, token0, token1, router1, _createValidIntent } = await deployContracts();

    const intent = await _createValidIntent({
        token0: token0,
        token1: token1,
        user: user1.address
    });

    const txs1 = [];
    txs1.push(frontendUtil.generateTx(function([dispatcher, user, intent]) {
        return dispatcher.connect(user).addIntent(intent);
    }, dispatcher, user1, intent));
    await frontendUtil.waitingTxs(txs1);

    const txs2 = [];
    txs2.push(frontendUtil.generateTx(function([dispatcher, user]) {
        return dispatcher.connect(user).dispatch();
    }, dispatcher, keeper));
    await frontendUtil.waitingTxs(txs2);

    expect(await mockSolver.callCount()).to.equal(1);

    const [metadata, intentdata] = await mockSolver.getLastCall();

    expect(metadata.length).to.equal(1);
    expect(intentdata.length).to.equal(1);

    expect(metadata[0].token0).to.equal(token0);
    expect(metadata[0].token1).to.equal(token1);
    expect(metadata[0].router).to.equal(router1.address);

    expect(intentdata[0].intents0to1.length).to.equal(1);
    expect(intentdata[0].intents1to0.length).to.equal(0);
    expect(intentdata[0].intents0to1[0].user).to.equal(user1.address);
    expect(intentdata[0].intents0to1[0].amountIn).to.equal(intent.amount);
    console.log("✅ test_Dispatch_OneIntent_0to1 Passed");
}

async function test_Dispatch_OneIntent_1to0() {
    console.log("Running: test_Dispatch_OneIntent_1to0...");
    const { dispatcher, mockSolver, keeper, user1, token0, token1, router1, _createValidIntent } = await deployContracts();

    const intent = await _createValidIntent({
        token0: token1, // Swapped
        token1: token0, // Swapped
        user: user1.address
    });
    
    const txs1 = [];
    txs1.push(frontendUtil.generateTx(function([dispatcher, user, intent]) {
        return dispatcher.connect(user).addIntent(intent);
    }, dispatcher, user1, intent));
    await frontendUtil.waitingTxs(txs1);

    const txs2 = [];
    txs2.push(frontendUtil.generateTx(function([dispatcher, user]) {
        return dispatcher.connect(user).dispatch();
    }, dispatcher, keeper));
    await frontendUtil.waitingTxs(txs2);

    expect(await mockSolver.callCount()).to.equal(1);
    const [metadata, intentdata] = await mockSolver.getLastCall();

    expect(metadata.length).to.equal(1);
    expect(metadata[0].token0).to.equal(token0); // Sorted
    expect(metadata[0].token1).to.equal(token1); // Sorted
    expect(metadata[0].router).to.equal(router1.address);

    expect(intentdata.length).to.equal(1);
    expect(intentdata[0].intents0to1.length).to.equal(0);
    expect(intentdata[0].intents1to0.length).to.equal(1);
    expect(intentdata[0].intents1to0[0].user).to.equal(user1.address);
    expect(intentdata[0].intents1to0[0].amountIn).to.equal(intent.amount);
    console.log("✅ test_Dispatch_OneIntent_1to0 Passed");
}

async function test_Dispatch_MultipleIntents_SamePair() {
    console.log("Running: test_Dispatch_MultipleIntents_SamePair...");
    const { dispatcher, mockSolver, keeper, user1, user2, token0, token1, router1, IntentStructFactory, _createValidIntent } = await deployContracts();

    const intentContainerAddr = await dispatcher.intentContainer();
    const intentContainer = IntentStructFactory.attach(intentContainerAddr);

    const intent1 = await _createValidIntent({
        token0: token0,
        token1: token1,
        router: router1.address,
        user: user1.address,
        amount: 100
    });

    const intent2 = await _createValidIntent({
        token0: token1,
        token1: token0,
        router: router1.address,
        user: user2.address,
        amount: 200
    });

    const intent3 = await _createValidIntent({
        token0: token0,
        token1: token1,
        router: router1.address,
        user: user2.address,
        amount: 300
    });

    const txs = [];
    txs.push(frontendUtil.generateTx(function([dispatcher, user, intent]) {
        return dispatcher.connect(user).addIntent(intent);
    }, dispatcher, user1, intent1));
    
    txs.push(frontendUtil.generateTx(function([dispatcher, user, intent]) {
        return dispatcher.connect(user).addIntent(intent);
    }, dispatcher, user2, intent2));

    txs.push(frontendUtil.generateTx(function([dispatcher, user, intent]) {
        return dispatcher.connect(user).addIntent(intent);
    }, dispatcher, user2, intent3));

    await frontendUtil.waitingTxs(txs);

    expect(await intentContainer.fullLength()).to.equal(3);

    const dispatchTx = [];
    dispatchTx.push(frontendUtil.generateTx(function([dispatcher, user]) {
        return dispatcher.connect(user).dispatch();
    }, dispatcher, keeper));
    await frontendUtil.waitingTxs(dispatchTx);

    expect(await mockSolver.callCount()).to.equal(1);
    const [metadata, intentdata] = await mockSolver.getLastCall();

    expect(metadata.length).to.equal(1);
    expect(intentdata.length).to.equal(1);

    expect(metadata[0].token0).to.equal(token0);
    expect(metadata[0].token1).to.equal(token1);
    expect(metadata[0].router).to.equal(router1.address);

    expect(intentdata[0].intents0to1.length).to.equal(2);
    expect(intentdata[0].intents1to0.length).to.equal(1);

    const intents0to1 = intentdata[0].intents0to1;
    const users0to1 = intents0to1.map(i => i.user);
    // Note: .toNumber() is Ethers v5. If you are on v6, this will fail.
    // The rest of the script seems to imply v5, so I'll keep it.
    const amounts0to1 = intents0to1.map(i => i.amountIn.toNumber()); 

    expect(users0to1).to.include.members([user1.address, user2.address]);
    expect(amounts0to1).to.include.members([100, 300]);

    expect(intentdata[0].intents1to0[0].user).to.equal(user2.address);
    expect(intentdata[0].intents1to0[0].amountIn).to.equal(200);
    console.log("✅ test_Dispatch_MultipleIntents_SamePair Passed");
}

async function test_Dispatch_MultipleIntents_DifferentPairs() {
    console.log("Running: test_Dispatch_MultipleIntents_DifferentPairs...");
    const { dispatcher, mockSolver, keeper, user1, user2, token0, token1, token2, router1, router2, IntentStructFactory, _createValidIntent } = await deployContracts();

    const intentContainerAddr = await dispatcher.intentContainer();
    const intentContainer = IntentStructFactory.attach(intentContainerAddr);

    const intent1 = await _createValidIntent({
        token0: token0,
        token1: token1,
        router: router1.address,
        user: user1.address,
        amount: 100
    });

    const intent2 = await _createValidIntent({
        token0: token1,
        token1: token2,
        router: router1.address,
        user: user2.address,
        amount: 200
    });

    const intent3 = await _createValidIntent({
        token0: token1,
        token1: token0,
        router: router2.address,
        user: user2.address,
        amount: 300
    });

    const txs = [];
    txs.push(frontendUtil.generateTx(function([dispatcher, user, intent]) {
        return dispatcher.connect(user).addIntent(intent);
    }, dispatcher, user1, intent1));
    
    txs.push(frontendUtil.generateTx(function([dispatcher, user, intent]) {
        return dispatcher.connect(user).addIntent(intent);
    }, dispatcher, user2, intent2));

    txs.push(frontendUtil.generateTx(function([dispatcher, user, intent]) {
        return dispatcher.connect(user).addIntent(intent);
    }, dispatcher, user2, intent3));
    
    await frontendUtil.waitingTxs(txs);
    
    expect(await intentContainer.fullLength()).to.equal(3);

    const dispatchTx = [];
    dispatchTx.push(frontendUtil.generateTx(function([dispatcher, user]) {
        return dispatcher.connect(user).dispatch();
    }, dispatcher, keeper));
    await frontendUtil.waitingTxs(dispatchTx);

    expect(await mockSolver.callCount()).to.equal(1);
    const [metadata, intentdata] = await mockSolver.getLastCall();

    expect(metadata.length).to.equal(3);
    expect(intentdata.length).to.equal(3);

    const batch1_idx = metadata.findIndex(m => 
        m.token0 === token0 && 
        m.token1 === token1 && 
        m.router === router1.address
    );
    expect(batch1_idx).to.not.equal(-1, "Batch 1 (t0, t1, r1) not found");
    expect(intentdata[batch1_idx].intents0to1.length).to.equal(1);
    expect(intentdata[batch1_idx].intents1to0.length).to.equal(0);
    expect(intentdata[batch1_idx].intents0to1[0].user).to.equal(user1.address);
    expect(intentdata[batch1_idx].intents0to1[0].amountIn).to.equal(100);

    const batch2_idx = metadata.findIndex(m => 
        m.token0 === token1 &&
        m.token1 === token2 &&
        m.router === router1.address
    );
    expect(batch2_idx).to.not.equal(-1, "Batch 2 (t1, t2, r1) not found");
    expect(intentdata[batch2_idx].intents0to1.length).to.equal(1);
    expect(intentdata[batch2_idx].intents1to0.length).to.equal(0);
    expect(intentdata[batch2_idx].intents0to1[0].user).to.equal(user2.address);
    expect(intentdata[batch2_idx].intents0to1[0].amountIn).to.equal(200);

    const batch3_idx = metadata.findIndex(m => 
        m.token0 === token0 &&
        m.token1 === token1 &&
        m.router === router2.address
    );
    expect(batch3_idx).to.not.equal(-1, "Batch 3 (t0, t1, r2) not found");
    expect(intentdata[batch3_idx].intents0to1.length).to.equal(0);
    expect(intentdata[batch3_idx].intents1to0.length).to.equal(1);
    expect(intentdata[batch3_idx].intents1to0[0].user).to.equal(user2.address);
    expect(intentdata[batch3_idx].intents1to0[0].amountIn).to.equal(300);
    console.log("✅ test_Dispatch_MultipleIntents_DifferentPairs Passed");
}


// --- Main Test Runner ---

async function main() {
    console.log("====== Running Dispatcher Tests ======");

    const tests = [
        test_AddIntent_Success,
        test_Dispatch_NoIntents,
        test_Dispatch_ContainerSwapLogic,
        test_Dispatch_OneIntent_0to1,
        test_Dispatch_OneIntent_1to0,
        test_Dispatch_MultipleIntents_SamePair,
        test_Dispatch_MultipleIntents_DifferentPairs
    ];

    let passed = 0;
    for (const test of tests) {
        try {
            await test();
            passed++;
        } catch (error) {
            console.error(`❌ ${test.name} FAILED`);
            console.error(error);
        }
    }

    console.log("====== Test Summary ======");
    console.log(`Passed: ${passed} / ${tests.length}`);
    if (passed !== tests.length) {
        process.exitCode = 1; // Exit with error code if any test failed
        throw new Error("Some tests failed!");
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
