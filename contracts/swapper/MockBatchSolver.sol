// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IBatchSolver.sol";

// Mock implementation of the IBatchSolver to simulate its behavior and
// check if it's called correctly in Dispatcher.t.sol and testDispatcher.js

contract MockBatchSolver is IBatchSolver {
    uint256 public callCount;
    PairMetadata[] internal lastMetadata;
    bytes[] internal lastIntentDataSerialized;

    event Solved(PairMetadata[] metadata, IntentData[] intentdata, uint256 batchCount);

    function solveMultipleBatch(PairMetadata[] memory metadata, IntentData[] memory intentdata) external override {
        callCount++;
        
        delete lastMetadata;
        for (uint i = 0; i < metadata.length; i++) {
            lastMetadata.push(metadata[i]);
        }
        
        delete lastIntentDataSerialized;
        for (uint i = 0; i < intentdata.length; i++) {
            lastIntentDataSerialized.push(abi.encode(intentdata[i]));
        }

        emit Solved(metadata, intentdata, metadata.length);
    }

    function withdrawFees(address token) external override {}

    function getLastCall() external view returns (PairMetadata[] memory, IntentData[] memory) {
        IntentData[] memory deserializedIntentData = new IntentData[](lastIntentDataSerialized.length);
        for (uint i = 0; i < lastIntentDataSerialized.length; i++) {
            deserializedIntentData[i] = abi.decode(lastIntentDataSerialized[i], (IntentData));
        }
        return (lastMetadata, deserializedIntentData);
    }
}