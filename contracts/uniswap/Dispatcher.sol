// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IntentStructConcurrentArray.sol";
import "./IBatchSolver.sol";

contract Dispatcher {
    
    IntentStruct public intentContainer;

    IBatchSolver public immutable solver;

    mapping(bytes32 => IBatchSolver.IntentData) private tempIntentData;
    mapping(bytes32 => IBatchSolver.PairMetadata) private tempMetadata;
    bytes32[] private tempPairHashes;

    constructor(address _solver) {
        require(_solver != address(0), "Solver address cannot be zero");
        solver = IBatchSolver(_solver);
        intentContainer = new IntentStruct();
    }

    function addIntent(IntentStruct.Intent memory elem) external {
        require(elem.user != address(0), "User cannot be zero");
        require(elem.token0 != address(0), "Token0 cannot be zero");
        require(elem.token1 != address(0), "Token1 cannot be zero");
        require(elem.token0 != elem.token1, "Tokens must be different");
        require(elem.router != address(0), "Router cannot be zero");
        require(elem.amount > 0, "Amount must be greater than zero");

        intentContainer.push(elem);

        if (block.number % 3 == 0) {
            dispatch();
        }
    }

    function dispatch() private {
        uint256 len = intentContainer.fullLength();

        if (len == 0) {
            return;
        }

        for (uint i = 0; i < len; i++) {
            IntentStruct.Intent memory fullIntent = intentContainer.get(i);

            (address token0, address token1) = (fullIntent.token0 < fullIntent.token1)
                ? (fullIntent.token0, fullIntent.token1)
                : (fullIntent.token1, fullIntent.token0);

            bytes32 pairHash = keccak256(
                abi.encodePacked(token0, token1, fullIntent.router)
            );

            IBatchSolver.Intent memory solverIntent = IBatchSolver.Intent(
                fullIntent.user,
                fullIntent.amount
            );

            if (tempMetadata[pairHash].router == address(0)) {
                tempMetadata[pairHash] = IBatchSolver.PairMetadata(
                    token0,
                    token1,
                    fullIntent.router
                );
                tempPairHashes.push(pairHash);
            }

            if (fullIntent.token0 == token0) {
                tempIntentData[pairHash].intents0to1.push(solverIntent);
            } else {
                tempIntentData[pairHash].intents1to0.push(solverIntent);
            }
        }

        uint256 numBatches = tempPairHashes.length;
        if (numBatches == 0) {
            _cleanup(len);
            return;
        }

        IBatchSolver.PairMetadata[] memory metadata = new IBatchSolver.PairMetadata[](
            numBatches
        );
        IBatchSolver.IntentData[] memory intentdata = new IBatchSolver.IntentData[](
            numBatches
        );

        for (uint i = 0; i < numBatches; i++) {
            bytes32 hash = tempPairHashes[i];
            metadata[i] = tempMetadata[hash];
            intentdata[i] = tempIntentData[hash];
        }

        solver.solveMultipleBatch(metadata, intentdata);

        _cleanup(len);
    }

    function _cleanup(uint256 len) private {
        for (uint i = 0; i < len; i++) {
            intentContainer.delLast();
        }

        for (uint i = 0; i < tempPairHashes.length; i++) {
            bytes32 hash = tempPairHashes[i];
            delete tempIntentData[hash];
            delete tempMetadata[hash];
        }
        delete tempPairHashes;
    }
}
