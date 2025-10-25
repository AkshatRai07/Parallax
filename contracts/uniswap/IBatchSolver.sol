// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBatchSolver {
    
    struct Intent {
        address user;
        uint256 amountIn;
    }

    struct PairMetadata {
        address token0;
        address token1;
        address router;
    }

    struct IntentData {
        Intent[] intents0to1;
        Intent[] intents1to0;
    }

    event BatchSettled(
        address indexed token0,
        address indexed token1,
        uint256 totalAmount0In,
        uint256 totalAmount1In,
        uint256 netAmountSwapped,
        address tokenSwapped
    );

    event UserSettled(
        address indexed user,
        address indexed tokenOut,
        uint256 amountOut
    );

    function solveMultipleBatch(
        PairMetadata[] memory metadata,
        IntentData[] memory intentdata
    ) external;
}