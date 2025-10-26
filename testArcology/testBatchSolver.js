// npx hardhat run testArcology/testBatchSolver.js --network TestnetInfo

import { network } from "hardhat";
import { expect } from "chai";

// --- Define constants for fee ---
// 0.05% fee rate (5 / 10000)
const FEE_NUMERATOR = 5n;
const FEE_DENOMINATOR = 10000n;

/**
 * Helper to create EIP-712 Permit signatures
 */
async function createPermitSignature(wallet, token, spender, amount, deadline) {
    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });

    const nonce = await token.nonces(wallet.address);
    const name = await token.name();
    const chainId = (await ethers.provider.getNetwork()).chainId;

    const domain = {
        name: name,
        version: '1',
        chainId: chainId,
        verifyingContract: token.address
    };

    const types = {
        Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" }
        ]
    };

    const value = {
        owner: wallet.address,
        spender: spender,
        value: amount,
        nonce: nonce,
        deadline: deadline
    };

    const signature = await wallet._signTypedData(domain, types, value);
    return ethers.utils.splitSignature(signature);
}

/**
 * Helper to create an intent struct with a valid permit
 */
async function createIntent(userWallet, token, solverAddress, amount, deadline) {
    const { v, r, s } = await createPermitSignature(
        userWallet,
        token,
        solverAddress,
        amount,
        deadline
    );
    return {
        user: userWallet.address,
        amountIn: amount,
        deadline: deadline,
        v: v,
        r: r,
        s: s
    };
}

/**
 * This function replaces `loadFixture`. It deploys a fresh set of contracts.
 */
async function deployContracts() {
    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });
     
    console.log("   Deploying fresh contracts...");
    const [keeper, user1, user2, other] = await ethers.getSigners();

    // Deploy Mock Tokens
    const MockERC20Factory = await ethers.getContractFactory("MockERC20Permit");
    // Sort addresses for deterministic token0/token1
    const addrs = [
        ethers.utils.getAddress(ethers.utils.id("token0").slice(0, 42)),
        ethers.utils.getAddress(ethers.utils.id("token1").slice(0, 42)),
        ethers.utils.getAddress(ethers.utils.id("token2").slice(0, 42))
    ].sort();

    const token0 = MockERC20Factory.attach(addrs[0]);
    const token1 = MockERC20Factory.attach(addrs[1]);
    const token2 = MockERC20Factory.attach(addrs[2]);

    // Deploy tokens (or attach if they are pre-deployed in the test env)
    try { await token0.deployed(); } catch (e) { /* ignore */ }
    try { await token1.deployed(); } catch (e) { /* ignore */ }
    try { await token2.deployed(); } catch (e) { /* ignore */ }

    // Deploy Mock Router
    const MockRouterFactory = await ethers.getContractFactory("MockUniswapRouter");
    const router = await MockRouterFactory.deploy(); 
    await router.deployed();

    // Deploy BatchSolver
    const BatchSolverFactory = await ethers.getContractFactory("BatchSolver");
    const batchSolver = await BatchSolverFactory.deploy(keeper.address);
    await batchSolver.deployed();

    // Mint tokens to users (1 million of each)
    const mintAmount = ethers.utils.parseEther("1000000");
    await token0.connect(other).mint(user1.address, mintAmount);
    await token1.connect(other).mint(user1.address, mintAmount);
    await token2.connect(other).mint(user1.address, mintAmount);
    await token0.connect(other).mint(user2.address, mintAmount);
    await token1.connect(other).mint(user2.address, mintAmount);
    await token2.connect(other).mint(user2.address, mintAmount);

    // Set 1:1 rates on the router
    await router.setRate(token0.address, token1.address, ethers.utils.parseEther("1"));
    await router.setRate(token1.address, token0.address, ethers.utils.parseEther("1.0"));
    await router.setRate(token1.address, token2.address, ethers.utils.parseEther("1.0"));
    await router.setRate(token2.address, token1.address, ethers.utils.parseEther("1.0"));

    console.log("   Contracts deployed.");
    return { batchSolver, router, token0, token1, token2, keeper, user1, user2, other };
}

// Helper to calculate output after fee
function getAmountOutWithFee(amount) {
    const fee = (BigInt(amount) * FEE_NUMERATOR) / FEE_DENOMINATOR;
    return BigInt(amount) - fee;
}

// --- Individual Test Cases ---

async function test_WithdrawFees_Success() {
    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });

    console.log("Running: test_WithdrawFees_Success...");
    const { batchSolver, token0, keeper, other } = await deployContracts();
    const feeAmount = ethers.utils.parseEther("100");
    
    await token0.connect(other).mint(batchSolver.address, feeAmount);
    expect(await token0.balanceOf(batchSolver.address)).to.equal(feeAmount);
    
    const keeperBalanceBefore = await token0.balanceOf(keeper.address);
    
    const tx = await batchSolver.connect(keeper).withdrawFees(token0.address);
    
    await expect(tx).to.emit(batchSolver, "FeesWithdrawn")
        .withArgs(token0.address, feeAmount);
    
    expect(await token0.balanceOf(batchSolver.address)).to.equal(0);
    expect(await token0.balanceOf(keeper.address)).to.equal(keeperBalanceBefore.add(feeAmount));
    console.log("✅ test_WithdrawFees_Success Passed");
}

async function test_WithdrawFees_NoBalance() {
    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });

    console.log("Running: test_WithdrawFees_NoBalance...");
    const { batchSolver, token0, keeper } = await deployContracts();
    
    expect(await token0.balanceOf(batchSolver.address)).to.equal(0);
    const keeperBalanceBefore = await token0.balanceOf(keeper.address);

    const tx = await batchSolver.connect(keeper).withdrawFees(token0.address);
    
    await expect(tx).to.not.emit(batchSolver, "FeesWithdrawn");
    
    expect(await token0.balanceOf(batchSolver.address)).to.equal(0);
    expect(await token0.balanceOf(keeper.address)).to.equal(keeperBalanceBefore);
    console.log("✅ test_WithdrawFees_NoBalance Passed");
}

async function test_Scenario1_PerfectCoW() {
    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });

    console.log("Running: test_Scenario1_PerfectCoW...");
    const { batchSolver, router, token0, token1, keeper, user1, user2 } = await deployContracts();

    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    const amount = ethers.utils.parseEther("100");

    const intent1 = await createIntent(user1, token0, batchSolver.address, amount, deadline);
    const intent2 = await createIntent(user2, token1, batchSolver.address, amount, deadline);

    const metadata = [{
        token0: token0.address,
        token1: token1.address,
        router: router.address
    }];
    const intentdata = [{
        intents0to1: [intent1],
        intents1to0: [intent2]
    }];

    const user1_t0_before = await token0.balanceOf(user1.address);
    const user1_t1_before = await token1.balanceOf(user1.address);
    const user2_t0_before = await token0.balanceOf(user2.address);
    const user2_t1_before = await token1.balanceOf(user2.address);

    const tx = await batchSolver.connect(keeper).solveMultipleBatch(metadata, intentdata);
    
    const expectedAmountOut = getAmountOutWithFee(amount);
    
    await expect(tx).to.emit(batchSolver, "BatchSettled")
        .withArgs(token0.address, token1.address, amount, amount, 0, ethers.constants.AddressZero);
    
    await expect(tx).to.emit(batchSolver, "UserSettled")
        .withArgs(user1.address, token1.address, expectedAmountOut);
    
    await expect(tx).to.emit(batchSolver, "UserSettled")
        .withArgs(user2.address, token0.address, expectedAmountOut);

    expect(await token0.balanceOf(user1.address)).to.equal(user1_t0_before.sub(amount));
    expect(await token1.balanceOf(user1.address)).to.equal(user1_t1_before.add(expectedAmountOut));
    expect(await token0.balanceOf(user2.address)).to.equal(user2_t0_before.add(expectedAmountOut));
    expect(await token1.balanceOf(user2.address)).to.equal(user2_t1_before.sub(amount));
    
    const expectedFee = BigInt(amount) - expectedAmountOut;
    expect(await token0.balanceOf(batchSolver.address)).to.equal(expectedFee);
    expect(await token1.balanceOf(batchSolver.address)).to.equal(expectedFee);
    
    expect(await batchSolver.totalSwapsProcessed()).to.equal(2);
    expect(await batchSolver.totalVolumeInTokens()).to.equal(0);
    console.log("✅ test_Scenario1_PerfectCoW Passed");
}

async function test_Scenario2_NetSwap0to1() {
    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });

    console.log("Running: test_Scenario2_NetSwap0to1...");
    const { batchSolver, router, token0, token1, keeper, user1, user2 } = await deployContracts();

    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    const amount100 = ethers.utils.parseEther("100");
    const amount50 = ethers.utils.parseEther("50");

    const intent1 = await createIntent(user1, token0, batchSolver.address, amount100, deadline);
    const intent2 = await createIntent(user2, token1, batchSolver.address, amount50, deadline);

    const metadata = [{
        token0: token0.address,
        token1: token1.address,
        router: router.address
    }];
    const intentdata = [{
        intents0to1: [intent1],
        intents1to0: [intent2]
    }];

    const user1_t1_before = await token1.balanceOf(user1.address);
    const user2_t0_before = await token0.balanceOf(user2.address);

    const netSwapAmount = amount100.sub(amount50);
    const expectedOut_user1 = getAmountOutWithFee(amount100);
    const expectedOut_user2 = getAmountOutWithFee(amount50);

    const tx = await batchSolver.connect(keeper).solveMultipleBatch(metadata, intentdata);

    await expect(tx).to.emit(batchSolver, "BatchSettled")
        .withArgs(token0.address, token1.address, amount100, amount50, netSwapAmount, token0.address);
    
    await expect(tx).to.emit(batchSolver, "UserSettled")
        .withArgs(user1.address, token1.address, expectedOut_user1);
    
    await expect(tx).to.emit(batchSolver, "UserSettled")
        .withArgs(user2.address, token0.address, expectedOut_user2);
    
    expect(await token1.balanceOf(user1.address)).to.equal(user1_t1_before.add(expectedOut_user1));
    expect(await token0.balanceOf(user2.address)).to.equal(user2_t0_before.add(expectedOut_user2));
    
    const fee1 = BigInt(amount100) - expectedOut_user1;
    const fee2 = BigInt(amount50) - expectedOut_user2;
    expect(await token1.balanceOf(batchSolver.address)).to.equal(fee1);
    expect(await token0.balanceOf(batchSolver.address)).to.equal(fee2);
    
    expect(await batchSolver.totalSwapsProcessed()).to.equal(2);
    expect(await batchSolver.totalVolumeInTokens()).to.equal(netSwapAmount);
    console.log("✅ test_Scenario2_NetSwap0to1 Passed");
}

async function test_Scenario3_NetSwap1to0() {
    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });
    
    console.log("Running: test_Scenario3_NetSwap1to0...");
    const { batchSolver, router, token0, token1, keeper, user1, user2 } = await deployContracts();

    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    const amount50 = ethers.utils.parseEther("50");
    const amount100 = ethers.utils.parseEther("100");

    const intent1 = await createIntent(user1, token0, batchSolver.address, amount50, deadline);
    const intent2 = await createIntent(user2, token1, batchSolver.address, amount100, deadline);

    const metadata = [{
        token0: token0.address,
        token1: token1.address,
        router: router.address
    }];
    const intentdata = [{
        intents0to1: [intent1],
        intents1to0: [intent2]
    }];

    const user1_t1_before = await token1.balanceOf(user1.address);
    const user2_t0_before = await token0.balanceOf(user2.address);

    const netSwapAmount = amount100.sub(amount50);
    const expectedOut_user1 = getAmountOutWithFee(amount50);
    const expectedOut_user2 = getAmountOutWithFee(amount100);

    const tx = await batchSolver.connect(keeper).solveMultipleBatch(metadata, intentdata);

    await expect(tx).to.emit(batchSolver, "BatchSettled")
        .withArgs(token0.address, token1.address, amount50, amount100, netSwapAmount, token1.address);
    
    await expect(tx).to.emit(batchSolver, "UserSettled")
        .withArgs(user1.address, token1.address, expectedOut_user1);
    
    await expect(tx).to.emit(batchSolver, "UserSettled")
        .withArgs(user2.address, token0.address, expectedOut_user2);
    
    expect(await token1.balanceOf(user1.address)).to.equal(user1_t1_before.add(expectedOut_user1));
    expect(await token0.balanceOf(user2.address)).to.equal(user2_t0_before.add(expectedOut_user2));
    
    const fee1 = BigInt(amount50) - expectedOut_user1;
    const fee2 = BigInt(amount100) - expectedOut_user2;
    expect(await token1.balanceOf(batchSolver.address)).to.equal(fee1);
    expect(await token0.balanceOf(batchSolver.address)).to.equal(fee2);
    
    expect(await batchSolver.totalSwapsProcessed()).to.equal(2);
    expect(await batchSolver.totalVolumeInTokens()).to.equal(netSwapAmount);
    console.log("✅ test_Scenario3_NetSwap1to0 Passed");
}

async function test_Scenario4_TwoBatches() {
    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });

    console.log("Running: test_Scenario4_TwoBatches...");
    const { batchSolver, router, token0, token1, token2, keeper, user1, user2 } = await deployContracts();

    const block = await ethers.provider.getBlock("latest");
    const deadline = block.timestamp + 3600;
    const amount100 = ethers.utils.parseEther("100");
    const amount50 = ethers.utils.parseEther("50");

    // Batch 1
    const intent1_1 = await createIntent(user1, token0, batchSolver.address, amount100, deadline);
    const intent1_2 = await createIntent(user2, token1, batchSolver.address, amount50, deadline);
    const expectedOut_1_1 = getAmountOutWithFee(amount100);
    const expectedOut_1_2 = getAmountOutWithFee(amount50);
    const netSwap_1 = amount100.sub(amount50);

    // Batch 2
    const intent2_1 = await createIntent(user1, token1, batchSolver.address, amount50, deadline);
    const intent2_2 = await createIntent(user2, token2, batchSolver.address, amount100, deadline);
    const expectedOut_2_1 = getAmountOutWithFee(amount50);
    const expectedOut_2_2 = getAmountOutWithFee(amount100);
    const netSwap_2 = amount100.sub(amount50);

    const metadata = [
        { token0: token0.address, token1: token1.address, router: router.address },
        { token0: token1.address, token1: token2.address, router: router.address }
    ];
    const intentdata = [
        { intents0to1: [intent1_1], intents1to0: [intent1_2] },
        { intents0to1: [intent2_1], intents1to0: [intent2_2] }
    ];

    const user1_t0_before = await token0.balanceOf(user1.address);
    const user1_t1_before = await token1.balanceOf(user1.address);
    const user1_t2_before = await token2.balanceOf(user1.address);
    const user2_t0_before = await token0.balanceOf(user2.address);
    const user2_t1_before = await token1.balanceOf(user2.address);
    const user2_t2_before = await token2.balanceOf(user2.address);

    const tx = await batchSolver.connect(keeper).solveMultipleBatch(metadata, intentdata);
    
    // Check events for Batch 1
    await expect(tx).to.emit(batchSolver, "BatchSettled")
        .withArgs(token0.address, token1.address, amount100, amount50, netSwap_1, token0.address);
    await expect(tx).to.emit(batchSolver, "UserSettled")
        .withArgs(user1.address, token1.address, expectedOut_1_1);
    await expect(tx).to.emit(batchSolver, "UserSettled")
        .withArgs(user2.address, token0.address, expectedOut_1_2);

    // Check events for Batch 2
    await expect(tx).to.emit(batchSolver, "BatchSettled")
        .withArgs(token1.address, token2.address, amount50, amount100, netSwap_2, token2.address);
    await expect(tx).to.emit(batchSolver, "UserSettled")
        .withArgs(user1.address, token2.address, expectedOut_2_1);
    await expect(tx).to.emit(batchSolver, "UserSettled")
        .withArgs(user2.address, token1.address, expectedOut_2_2);
        
    expect(await batchSolver.totalSwapsProcessed()).to.equal(4);
    expect(await batchSolver.totalVolumeInTokens()).to.equal(netSwap_1.add(netSwap_2));
    
    expect(await token0.balanceOf(user1.address)).to.equal(user1_t0_before.sub(amount100));
    expect(await token1.balanceOf(user1.address)).to.equal(user1_t1_before.sub(amount50).add(expectedOut_1_1));
    expect(await token2.balanceOf(user1.address)).to.equal(user1_t2_before.add(expectedOut_2_1));
    
    expect(await token0.balanceOf(user2.address)).to.equal(user2_t0_before.add(expectedOut_1_2));
    expect(await token1.balanceOf(user2.address)).to.equal(user2_t1_before.sub(amount50).add(expectedOut_2_2));
    expect(await token2.balanceOf(user2.address)).to.equal(user2_t2_before.sub(amount100));
    console.log("✅ test_Scenario4_TwoBatches Passed");
}


// --- Main Test Runner ---

async function main() {
    console.log("====== Running BatchSolver Tests ======");

    const tests = [
        test_WithdrawFees_Success,
        test_WithdrawFees_NoBalance,
        test_Scenario1_PerfectCoW,
        test_Scenario2_NetSwap0to1,
        test_Scenario3_NetSwap1to0,
        test_Scenario4_TwoBatches
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
        throw new Error("Some tests failed!");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
