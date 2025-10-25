// hardhat.config.ts
import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable } from "hardhat/config";
import networkJson from "./network.json";

interface TestnetInfo {
  url: string;
  accounts: string[];
  addrs: string[];
  chainId: number;
}

type Config = {
  TestnetInfo: TestnetInfo;
};

const nets: Config = networkJson as Config;

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    compilers: [
      {
        version: "0.8.30",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      {
        version: "0.6.6",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
      {
        version: "0.5.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
    ],
    npmFilesToBuild: [
      "@uniswap/v2-core/contracts/UniswapV2Factory.sol",
      "@uniswap/v2-core/contracts/UniswapV2Pair.sol",
      "@uniswap/v2-periphery/contracts/UniswapV2Router02.sol",
      "@uniswap/v2-periphery/contracts/test/WETH9.sol",
    ],
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    TestnetInfo: {
      type: "http",
      chainType: "l1",
      url: nets.TestnetInfo.url,
      accounts: nets.TestnetInfo.accounts,
    },
  },
};

export default config;
