// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IntentStructConcurrentArray.sol";
import "../swapper/IBatchSolver.sol";

contract Dispatcher {

    IntentStruct public intentContainer;
    IntentStruct public processingContainer;
    IBatchSolver public immutable solver;
    address public immutable keeper;

    mapping(bytes32 => IBatchSolver.IntentData) private tempIntentData;
    mapping(bytes32 => IBatchSolver.PairMetadata) private tempMetadata;
    bytes32[] private tempPairHashes;

    constructor(address _solver, address _keeper) {
        require(_solver != address(0), "Solver address cannot be zero");
        require(_keeper != address(0), "Keeper address cannot be zero");
        solver = IBatchSolver(_solver);
        keeper = _keeper;
        intentContainer = new IntentStruct();
        processingContainer = new IntentStruct();
    }

    function addIntent(IntentStruct.Intent memory elem) external {
        require(elem.user != address(0), "User cannot be zero");
        require(elem.token0 != address(0), "Token0 cannot be zero");
        require(elem.token1 != address(0), "Token1 cannot be zero");
        require(elem.token0 != elem.token1, "Tokens must be different");
        require(elem.router != address(0), "Router cannot be zero");
        require(elem.amount > 0, "Amount must be greater than zero");
        require(elem.deadline >= block.timestamp, "Permit deadline expired");

        intentContainer.push(elem);
    }

    function dispatch() external {
        require(msg.sender == keeper, "Sender not keeper");

        IntentStruct containerToProcess = intentContainer;
        intentContainer = processingContainer;

        processingContainer = new IntentStruct();

        uint256 len = containerToProcess.fullLength();

        if (len == 0) {
            return;
        }

        for (uint i = 0; i < len; i++) {
            IntentStruct.Intent memory fullIntent = containerToProcess.get(i);

            (address token0, address token1) = (fullIntent.token0 < fullIntent.token1)
                ? (fullIntent.token0, fullIntent.token1)
                : (fullIntent.token1, fullIntent.token0);

            bytes32 pairHash = keccak256(
                abi.encodePacked(token0, token1, fullIntent.router)
            );

            IBatchSolver.Intent memory solverIntent = IBatchSolver.Intent(
                fullIntent.user,
                fullIntent.amount,
                fullIntent.deadline,
                fullIntent.v,
                fullIntent.r,
                fullIntent.s
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
            _cleanup();
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

        _cleanup();
    }

    function _cleanup() private {
        for (uint i = 0; i < tempPairHashes.length; i++) {
            bytes32 hash = tempPairHashes[i];
            delete tempIntentData[hash];
            delete tempMetadata[hash];
        }
        delete tempPairHashes;
    }
}
