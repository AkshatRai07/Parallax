# Parallax

Parallax is a high-performance, intent-based parallel exchange (DEX) built on the **Arcology** blockchain, designed to execute massive volumes of swaps concurrently. It leverages **Hardhat 3** for all testing, simulation, and deployment tasks, and UniSwap V2 contracts for the swapping contracts.

This project moves away from the traditional transactional model (1 swap = 1 tx) and introduces an intent-based model (many intents = 1 batch tx). This design solves state contention issues common in Arcology and significantly minimizes MEV opportunities.

-----

## Architecture & How It Works

The system is split into two main contracts: `Dispatcher.sol` (for parallel intent collection) and `BatchSolver.sol` (for parallel swap execution).

### ASCII Architecture

```
                           +------------------+
[Users] --addIntent()-->   |  Dispatcher.sol  |
                           | (IntentStruct[]) |
                           +------------------+
                                    |
                                    | (Keeper calls dispatch())
                                    |
                            +------------------+
                            |  BatchSolver.sol |
                            +------------------+
                                    |
    +-----------------------------------+-----------------------------------+
    | (Parallel Execution via MultiProcessor)                               |
    v                                   v                                   v
+----------+                        +----------+                        +----------+
| Pair A/B |                        | Pair C/D |                        | Pair E/F |
| (CoW*)   |                        | (CoW*)   |                        | (CoW*)   |
+----------+                        +----------+                        +----------+
    |                                   |                                   |
    v                                   v                                   v
(Swap & Settlement)              (Swap & Settlement)                (Swap & Settlement)

* CoW = Coincidence of Wants
```

### Execution Flow

1.  **Intent Collection:** Users submit their swap intentions (e.g., "I want to sell 1 ETH for at least 3000 USDC") by calling `addIntent()` on `Dispatcher.sol`. The intents also include `EIP-2612` for better UX (no need for approve())
2.  **Custom Parallel Data Structure:** These intents are stored in an `IntentStruct` array. This is a **custom parallel-safe data type** modeled directly after Arcology's native parallel data structures, designed for efficient batch processing.
3.  **Batch Dispatch:** A keeper account calls `dispatch()` in a cron job. This function organizes all pending intents into `metadata` (one per token pair) and a list of `intents` for each pair.
4.  **Parallel Solving:** The `BatchSolver.sol` contract receives this data. It uses Arcology's **`MultiProcessor`** to spawn a new, parallel execution thread for *each token pair*.
5.  **Coincidence of Wants (CoW):** Inside each parallel thread, the solver handles all intents for that specific pair (e.g., all ETH-USDC and USDC-ETH swaps), finds the "coincidence of wants," and calculates the settlement.
6. **UniSwap V2:** After the net amount is calculated, it sends only one transaction to the router instead of 100s of intents.
7.  **Atomic Settlement:** The amounts are settled, and users receive their tokens. This batching model solves contention for popular pairs and obfuscates transaction order, minimizing MEV.
8.  **Keeper Reward:** The keeper receives a **0.05% fee** from the output value of all swaps.
9.  **Parallel Aggregation:** Global statistics, which are total token volume and the total number of swaps, are safely aggregated across all parallel threads using Arcology's **`U256Cumulative`** data type.

---

## Hackathon Submission

This project is submitted for the following bounties:

  * **Arcology:**  The Best Parallel Contracts
  * **Hardhat:**  Best projects built using Hardhat 3

---

## Fulfilling Bounty Requirements

This project was built specifically to meet the criteria for the Arcology and Hardhat bounties.

### 🚀 Arcology: The Best Parallel Contracts

  * **Effective Use of Parallel Features:**
      * **`MultiProcessor`:** This is the core of the `BatchSolver.sol` contract. It is used to process each token pair's intent batch in a completely separate, parallel thread, allowing the DEX to scale horizontally.
      * **`U256Cumulative`:** This parallel-safe data type is used to aggregate global statistics (total volume, swap count) from all threads without causing state contention.
  * **Custom Parallel Design:** The `IntentStruct` array in `Dispatcher.sol` is designed explicitly for parallel consumption by `BatchSolver.sol`, demonstrating an understanding of parallel-safe contract design principles.
  * **Real-World Scalability:** By batching intents and processing pairs in parallel, Parallax can achieve thousands of TPS, limited only by the number of parallel threads Arcology can support, not by single-threaded state contention on one popular pair.
  * **Better than NettedAMM:** The UniSwap V3 implementation given in Arcology's examples targets just one Pair and dispatches at a certain threshold, while my architecture handles multiple pairs parallely and dispatching doesn't depend on the transaction frequency.
  * **Benchmark Scripts:** A benchmark script is included to measure the throughput of the `addIntent` function in `Dispatcher.sol`, providing a baseline for ingestion performance.
  * **Deployment Script:** A deployment script is provided in `scripts/Deploy.js`. (See known issue below).

### 👷 Hardhat: Best projects built using Hardhat 3

  * **Hardhat 3.0.0+ Usage:** The entire project is built, compiled, and tested using **Hardhat 3**.
  * **Solidity Tests:** All core unit tests for `Dispatcher.sol` and `BatchSolver.sol` are written in **Solidity** (e.g., using `forge-std/Test.sol`), as supported by Hardhat 3.
  * **Advanced TypeScript Tests:** Advanced integration tests, multi-step scenarios, and keeper simulations are written in **TypeScript** using Hardhat 3's powerful testing and network simulation environment.
  * **Main Development Tool:** Hardhat 3 was the central tool for managing the entire development lifecycle, from compilation and testing (both Solidity and TS) to scripting deployments and benchmarks.

-----

##  Issue: Deployment on Arcology DevNet

There is a critical issue when attempting to deploy this project to the Arcology DevNet.

  * **Symptom:** The deployment script `scripts/Deploy.js` works perfectly on a local Hardhat node (`npx hardhat node`). However, when targeting the Arcology DevNet, the transaction to deploy the very first contract (`Dispatcher.sol`) reverts.
  * **Analysis:** Transaction logs from the DevNet show a gas usage of **`6.27 * 10^17`**.
  * **Hypothesis:** This gas cost is astronomically high and incorrect. We believe this is a **potential bug in the Arcology DevNet node** or its EVM implementation. The node appears to be miscalculating the gas required for contract creation, causing it to reject the transaction and prevent it from ever being included in a block.