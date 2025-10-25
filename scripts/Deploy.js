// npx hardhat run scripts/Deploy.js --network TestnetInfo

async function main() {
    const [deployer] = await ethers.getSigners();
    const keeperAddress = deployer.address;
    console.log(`Deploying contracts with the account: ${keeperAddress}`);

    console.log("\nDeploying mock ERC20 tokens...");

    const DAI = await ethers.getContractFactory("DAI");
    const dai = await DAI.deploy();
    await dai.deployed();
    console.log(`DAI deployed to: ${dai.address}`);

    const USDC = await ethers.getContractFactory("USDC");
    const usdc = await USDC.deploy();
    await usdc.deployed();
    console.log(`USDC deployed to: ${usdc.address}`);

    const Doge = await ethers.getContractFactory("Doge");
    const doge = await Doge.deploy();
    await doge.deployed();
    console.log(`Doge deployed to: ${doge.address}`);

    console.log("\nDeploying Uniswap V2...");

    const UniswapV2Factory = await ethers.getContractFactory(
        "UniswapV2Factory",
        deployer
    );
    const factory = await UniswapV2Factory.deploy(keeperAddress);
    await factory.deployed();
    console.log(`UniswapV2Factory deployed to: ${factory.address}`);

    const UniswapV2Router02 = await ethers.getContractFactory(
        "UniswapV2Router02",
        deployer
    );
    const router = await UniswapV2Router02.deploy(factory.address, dai.address);
    await router.deployed();
    console.log(`UniswapV2Router02 deployed to: ${router.address}`);

    console.log("\nCreating Uniswap pairs...");
    await factory.createPair(dai.address, usdc.address);
    console.log("Created DAI/USDC pair");
    await factory.createPair(dai.address, doge.address);
    console.log("Created DAI/Doge pair");
    await factory.createPair(usdc.address, doge.address);
    console.log("Created USDC/Doge pair");

    console.log("\nDeploying BatchSolver...");
    const BatchSolver = await ethers.getContractFactory("BatchSolver");
    const batchSolver = await BatchSolver.deploy(keeperAddress);
    await batchSolver.deployed();
    console.log(`BatchSolver deployed to: ${batchSolver.address}`);

    console.log("\nDeploying Dispatcher...");
    const Dispatcher = await ethers.getContractFactory("Dispatcher");
    const dispatcher = await Dispatcher.deploy(
        batchSolver.address,
        keeperAddress
    );
    await dispatcher.deployed();
    console.log(`Dispatcher deployed to: ${dispatcher.address}`);

    console.log("\n✅ Deployment complete!");
    console.log("---");
    console.log(`Keeper Address: ${keeperAddress}`);
    console.log(`Dispatcher: ${dispatcher.address}`);
    console.log(`BatchSolver: ${batchSolver.address}`);
    console.log(`UniswapRouter: ${router.address}`);
    console.log("---");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
