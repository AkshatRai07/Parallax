// npx hardhat run testArcology/testBatchSolver.js --network TestnetInfo

import { network } from "hardhat";
import loadFixture from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";

describe("BatchSolver (Arcology Test)", async function () {

    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });

    const FEE_NUMERATOR = 5n;
    const FEE_DENOMINATOR = 10000n;

    async function createPermitSignature(wallet, token, spender, amount, deadline) {
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

    async function deployContractsFixture() {
        const [keeper, user1, user2, other] = await ethers.getSigners();

        const MockERC20Factory = await ethers.getContractFactory("MockERC20Permit");

        const addrs = [
            ethers.utils.getAddress(ethers.utils.id("token0").slice(0, 42)),
            ethers.utils.getAddress(ethers.utils.id("token1").slice(0, 42)),
            ethers.utils.getAddress(ethers.utils.id("token2").slice(0, 42))
        ].sort();

        const token0 = MockERC20Factory.attach(addrs[0]);
        const token1 = MockERC20Factory.attach(addrs[1]);
        const token2 = MockERC20Factory.attach(addrs[2]);

        try { await token0.waitForDeployment(); } catch (e) { /* ignore */ }
        try { await token1.waitForDeployment(); } catch (e) { /* ignore */ }
        try { await token2.waitForDeployment(); } catch (e) { /* ignore */ }

        const MockRouterFactory = await ethers.getContractFactory("MockUniswapRouter");
        const router = await MockRouterFactory.deploy();
        await router.waitForDeployment();

        const BatchSolverFactory = await ethers.getContractFactory("BatchSolver");
        const batchSolver = await BatchSolverFactory.deploy(keeper.address);
        await batchSolver.waitForDeployment();

        const mintAmount = ethers.utils.parseEther("1000000");
        await token0.connect(other).mint(user1.address, mintAmount);
        await token1.connect(other).mint(user1.address, mintAmount);
        await token2.connect(other).mint(user1.address, mintAmount);
        await token0.connect(other).mint(user2.address, mintAmount);
        await token1.connect(other).mint(user2.address, mintAmount);
        await token2.connect(other).mint(user2.address, mintAmount);

        await router.setRate(token0.address, token1.address, ethers.utils.parseEther("1"));
        await router.setRate(token1.address, token0.address, ethers.utils.parseEther("1.0"));
        await router.setRate(token1.address, token2.address, ethers.utils.parseEther("1.0"));
        await router.setRate(token2.address, token1.address, ethers.utils.parseEther("1.0"));

        return { batchSolver, router, token0, token1, token2, keeper, user1, user2 };
    }

    describe("withdrawFees", function () {
        it("test_WithdrawFees_Success", async function () {
            const { batchSolver, token0, keeper } = await loadFixture(deployContractsFixture);
            const feeAmount = ethers.utils.parseEther("100");

            await token0.connect(keeper).mint(batchSolver.address, feeAmount);
            expect(await token0.balanceOf(batchSolver.address)).to.equal(feeAmount);
            
            const keeperBalanceBefore = await token0.balanceOf(keeper.address);
            
            const tx = await batchSolver.connect(keeper).withdrawFees(token0.address);
            
            await expect(tx).to.emit(batchSolver, "FeesWithdrawn")
                .withArgs(token0.address, feeAmount);
            
            expect(await token0.balanceOf(batchSolver.address)).to.equal(0);
            expect(await token0.balanceOf(keeper.address)).to.equal(keeperBalanceBefore.add(feeAmount));
        });

        it("test_WithdrawFees_NoBalance", async function () {
            const { batchSolver, token0, keeper } = await loadFixture(deployContractsFixture);
            
            expect(await token0.balanceOf(batchSolver.address)).to.equal(0);
            const keeperBalanceBefore = await token0.balanceOf(keeper.address);

            const tx = await batchSolver.connect(keeper).withdrawFees(token0.address);
            
            await expect(tx).to.not.emit(batchSolver, "FeesWithdrawn");
            
            expect(await token0.balanceOf(batchSolver.address)).to.equal(0);
            expect(await token0.balanceOf(keeper.address)).to.equal(keeperBalanceBefore);
        });
    });

    describe("solveMultipleBatch", function () {

        function getAmountOutWithFee(amount) {
            const fee = (BigInt(amount) * FEE_NUMERATOR) / FEE_DENOMINATOR;
            return BigInt(amount) - fee;
        }

        it("Scenario 1: Single Batch, Perfect CoW (No Swap)", async function () {
            const { batchSolver, router, token0, token1, keeper, user1, user2 } = await loadFixture(deployContractsFixture);

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
        });
        
        it("Scenario 2: Single Batch, Net Swap 0->1", async function () {
            const { batchSolver, router, token0, token1, keeper, user1, user2 } = await loadFixture(deployContractsFixture);

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
            expect(await token1.balanceOf(batchSolver.address)).to.equal(fee1); // 0.05
            expect(await token0.balanceOf(batchSolver.address)).to.equal(fee2); // 0.025
            
            expect(await batchSolver.totalSwapsProcessed()).to.equal(2);
            expect(await batchSolver.totalVolumeInTokens()).to.equal(netSwapAmount);
        });
        
        it("Scenario 3: Single Batch, Net Swap 1->0", async function () {
            const { batchSolver, router, token0, token1, keeper, user1, user2 } = await loadFixture(deployContractsFixture);

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
        });

        it("Scenario 4: Two Batches (Multiprocess check)", async function () {
            const { batchSolver, router, token0, token1, token2, keeper, user1, user2 } = await loadFixture(deployContractsFixture);

            const block = await ethers.provider.getBlock("latest");
            const deadline = block.timestamp + 3600;
            const amount100 = ethers.utils.parseEther("100");
            const amount50 = ethers.utils.parseEther("50");

            const intent1_1 = await createIntent(user1, token0, batchSolver.address, amount100, deadline);
            const intent1_2 = await createIntent(user2, token1, batchSolver.address, amount50, deadline);
            const expectedOut_1_1 = getAmountOutWithFee(amount100);
            const expectedOut_1_2 = getAmountOutWithFee(amount50);
            const netSwap_1 = amount100.sub(amount50);

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
            
            await expect(tx).to.emit(batchSolver, "BatchSettled")
                .withArgs(token0.address, token1.address, amount100, amount50, netSwap_1, token0.address);
            await expect(tx).to.emit(batchSolver, "UserSettled")
                .withArgs(user1.address, token1.address, expectedOut_1_1);
            await expect(tx).to.emit(batchSolver, "UserSettled")
                .withArgs(user2.address, token0.address, expectedOut_1_2);

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
        });
    });
});
