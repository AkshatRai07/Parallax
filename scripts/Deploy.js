// npx hardhat run scripts/Deploy.js --network TestnetInfo
import { network } from "hardhat";

async function main() {
    const { ethers } = await network.connect({
        network: "TestnetInfo",
        chainType: "l1",
    });
    const [deployer] = await ethers.getSigners();
    const keeperAddress = deployer.address;
    console.log(`Deploying contracts with the account: ${keeperAddress}`);

    console.log("\nDeploying mock ERC20 tokens...");

    const DAI = await ethers.getContractFactory("DAI");
    const dai = await DAI.deploy();
    await dai.waitForDeployment();
    console.log(`DAI deployed to: ${dai.target}`);

    const USDC = await ethers.getContractFactory("USDC");
    const usdc = await USDC.deploy();
    await usdc.waitForDeployment();
    console.log(`USDC deployed to: ${usdc.target}`);

    const Doge = await ethers.getContractFactory("Doge");
    const doge = await Doge.deploy();
    await doge.waitForDeployment();
    console.log(`Doge deployed to: ${doge.target}`);

    console.log("\nDeploying Uniswap V2...");

    const UniswapV2Factory = await ethers.getContractFactory(
        "UniswapV2Factory",
        deployer
    );
    const factory = await UniswapV2Factory.deploy(keeperAddress);
    await factory.deployed;
    console.log(`UniswapV2Factory deployed to: ${factory.target}`);

    const UniswapV2Router02 = await ethers.getContractFactory(
        "UniswapV2Router02",
        deployer
    );
    const router = await UniswapV2Router02.deploy(factory.target, dai.target);
    await router.deployed;
    console.log(`UniswapV2Router02 deployed to: ${router.target}`);

    console.log("\nCreating Uniswap pairs...");
    await factory.createPair(dai.target, usdc.target);
    console.log("Created DAI/USDC pair");
    await factory.createPair(dai.target, doge.target);
    console.log("Created DAI/Doge pair");
    await factory.createPair(usdc.target, doge.target);
    console.log("Created USDC/Doge pair");

    console.log("\nDeploying BatchSolver...");
    const BatchSolver = await ethers.getContractFactory("BatchSolver");
    const batchSolver = await BatchSolver.deploy(keeperAddress);
    await batchSolver.deployed;
    console.log(`BatchSolver deployed to: ${batchSolver.target}`);

    console.log("\nDeploying Dispatcher...");
    const Dispatcher = await ethers.getContractFactory("Dispatcher");
    const dispatcher = await Dispatcher.deploy(
        batchSolver.target,
        keeperAddress
    );
    await dispatcher.deployed;
    console.log(`Dispatcher deployed to: ${dispatcher.target}`);

    console.log("\n✅ Deployment complete!");
    console.log("---");
    console.log(`Keeper Address: ${keeperAddress}`);
    console.log(`Dispatcher: ${dispatcher.target}`);
    console.log(`BatchSolver: ${batchSolver.target}`);
    console.log(`UniswapRouter: ${router.target}`);
    console.log("---");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
