// npx hardhat run testArcology/testDispatcher.js --network TestnetInfo

import { network } from "hardhat";
import frontendUtil from '@arcologynetwork/frontend-util/utils/util.js';
import { expect } from "chai";

describe("Dispatcher (Arcology Test)", async function () {

    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });

    let dispatcher;
    let mockSolver;
    let keeper, user1, user2;
    let token0, token1, token2;
    let router1, router2;
    let IntentStructFactory;

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

    beforeEach(async function () {
        const accounts = await ethers.getSigners();
        keeper = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];

        const addrs = [
            ethers.utils.getAddress(ethers.utils.id("token0").slice(0, 42)),
            ethers.utils.getAddress(ethers.utils.id("token1").slice(0, 42)),
            ethers.utils.getAddress(ethers.utils.id("token2").slice(0, 42))
        ].sort();
        
        token0 = addrs[0];
        token1 = addrs[1];
        token2 = addrs[2];

        router1 = ethers.Wallet.createRandom();
        router2 = ethers.Wallet.createRandom();

        const MockSolverFactory = await ethers.getContractFactory("MockBatchSolver");
        mockSolver = await MockSolverFactory.deploy();
        await mockSolver.waitForDeployment();

        const DispatcherFactory = await ethers.getContractFactory("Dispatcher");
        dispatcher = await DispatcherFactory.deploy(mockSolver.target, keeper.address);
        await dispatcher.waitForDeployment();

        IntentStructFactory = await ethers.getContractFactory("IntentStruct");
    });

    it("test_AddIntent_Success", async function () {
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
    });

    it("test_Dispatch_NoIntents", async function () {
        const intentContainerAddr = await dispatcher.intentContainer();
        const intentContainer = IntentStructFactory.attach(intentContainerAddr);

        expect(await intentContainer.fullLength()).to.equal(0);

        const txs = [];
        txs.push(frontendUtil.generateTx(function([dispatcher, user]) {
            return dispatcher.connect(user).dispatch();
        }, dispatcher, keeper));
        await frontendUtil.waitingTxs(txs);

        expect(await mockSolver.callCount()).to.equal(0);
    });

    it("test_Dispatch_ContainerSwapLogic", async function () {
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
    });

    it("test_Dispatch_OneIntent_0to1", async function () {
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
    });

    it("test_Dispatch_OneIntent_1to0", async function () {
        const intent = await _createValidIntent({
            token0: token1,
            token1: token0,
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
        expect(metadata[0].token0).to.equal(token0);
        expect(metadata[0].token1).to.equal(token1);
        expect(metadata[0].router).to.equal(router1.address);

        expect(intentdata.length).to.equal(1);
        expect(intentdata[0].intents0to1.length).to.equal(0);
        expect(intentdata[0].intents1to0.length).to.equal(1);
        expect(intentdata[0].intents1to0[0].user).to.equal(user1.address);
        expect(intentdata[0].intents1to0[0].amountIn).to.equal(intent.amount);
    });

    it("test_Dispatch_MultipleIntents_SamePair (Concurrent)", async function () {
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
        const amounts0to1 = intents0to1.map(i => i.amountIn.toNumber());

        expect(users0to1).to.include.members([user1.address, user2.address]);
        expect(amounts0to1).to.include.members([100, 300]);

        expect(intentdata[0].intents1to0[0].user).to.equal(user2.address);
        expect(intentdata[0].intents1to0[0].amountIn).to.equal(200);
    });

    it("test_Dispatch_MultipleIntents_DifferentPairs (Concurrent)", async function () {
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
    });
});
