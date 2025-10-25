// Run tx generation script with this:
// npx hardhat run benchmark/genTxDispatcher.js --network TestnetInfo
// Run benchmark with this:
// npx arcology.net-tx-sender http://192.168.1.103:8545 benchmark/dispatcher/txs/like/addIntent/

import hre, { network } from "hardhat";
import frontendUtil from "@arcologynetwork/frontend-util/utils/util";
import nets from "../network.json";
import ProgressBar from "progress";

async function main() {

    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });

    const accounts = await ethers.getSigners();
    const provider = new ethers.providers.JsonRpcProvider(
        nets[hre.network.name].url
    );

    // Use the first account (default deployer) as the keeper
    const pkCreator = nets[hre.network.name].accounts[0];
    const signerCreator = new ethers.Wallet(pkCreator, provider);
    const keeper = await signerCreator.getAddress();

    // Use the second account as a mock solver address
    const mockSolver = await accounts[1].getAddress();

    // Define output path for the transactions
    const txbase = "benchmark/dispatcher/txs";
    frontendUtil.ensurePath(txbase);
    frontendUtil.ensurePath(txbase + "/addIntent");

    let i, tx;

    console.log("====== Start Deploying Dispatcher Contract ======");
    const dispatcherFactory = await ethers.getContractFactory("Dispatcher");
    const dispatcher = await dispatcherFactory.deploy(mockSolver, keeper);
    await dispatcher.deployed();
    console.log(`Deployed Dispatcher at ${dispatcher.address}`);

    // --- Define Mock Assets for Intents ---
    const mockToken0 = "0x" + "1".repeat(40);
    const mockToken1 = "0x" + "2".repeat(40);
    const mockRouter = "0x" + "3".repeat(40);
    // ------------------------------------

    console.log("====== Start Generating TXs Calling addIntent ======");
    const accountsLength = 100; // accounts.length is 100k, I don't want to kill my CPU
    const handle_dispatcher = frontendUtil.newFile(
        txbase + "/addIntent/dispatcher.out"
    );

    const bar = new ProgressBar(
        "Generating Tx data [:bar] :percent :etas",
        {
            total: accountsLength, // Total ticks is number of accounts
            width: 40,
            complete: "*",
            incomplete: " ",
        }
    );

    for (i = 0; i < accountsLength; i++) {
        const pk = nets[hre.network.name].accounts[i];
        if (!pk) {
            console.warn(`\nWarning: No private key found for account ${i}. Skipping.`);
            bar.tick(1); // Still tick the bar
            continue;
        }
        const signer = new ethers.Wallet(pk, provider);
        const userAddress = await signer.getAddress();

        // 1. Create the Intent struct for this user
        const intent = {
            user: userAddress,
            token0: mockToken0,
            token1: mockToken1,
            router: mockRouter,
            amount: ethers.utils.parseEther("100"), // 100 tokens
            deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
            v: 27, // Placeholder signature value
            // Use hexZeroPad to ensure r and s are 32 bytes
            r: ethers.utils.hexZeroPad(ethers.utils.hexlify(i + 1), 32),
            s: ethers.utils.hexZeroPad(ethers.utils.hexlify(i + 2), 32),
        };

        // 2. Populate the addIntent transaction
        tx = await dispatcher
            .connect(signer)
            .populateTransaction
            .addIntent(intent);

        // 3. Write the pre-signed transaction to the output file
        await frontendUtil.writePreSignedTxFile(handle_dispatcher, signer, tx);

        bar.tick(1);
    }

    if (bar.complete) {
        console.log(`\nTest data generation completed: ${accountsLength} transactions.`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
