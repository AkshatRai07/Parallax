// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@arcologynetwork/concurrentlib/lib/multiprocess/Multiprocess.sol";
import "@arcologynetwork/concurrentlib/lib/commutative/U256Cum.sol";

contract BatchSolver {

    U256Cumulative public totalSwapsProcessed = new U256Cumulative(0, type(uint256).max);
    U256Cumulative public totalVolumeInTokens = new U256Cumulative(0, type(uint256).max);
    address public keeper;

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

    event FeesWithdrawn(
        address indexed tokenAddress,
        uint256 indexed amount
    );

    constructor(address _keeper) {
        require(_keeper != address(0), "Keeper address cannot be zero");
        keeper = _keeper;
    }

    function withdrawFees(address token) external {
        require(msg.sender == keeper, "Only keeper");
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).transfer(keeper, balance);
            emit FeesWithdrawn(token, balance);
        }
    }

    function solveMultipleBatch(PairMetadata[] memory metadata, IntentData[] memory intentdata) public {
        require(metadata.length == intentdata.length, "Unequal data given");
        Multiprocess mp = new Multiprocess(2);
        for (uint i = 0; i < metadata.length; i++) {
            mp.addJob(
                100_000_000,
                0,
                address(this),
                abi.encodeWithSignature("solveBatch(PairMetadata,IntentData)", metadata[i], intentdata[i])
            );
        }
        mp.run();
    }

    function solveBatch(PairMetadata memory metadata, IntentData memory intents) public {
        require(msg.sender == address(this), "Only callable via Multiprocess");
        require(metadata.token0 < metadata.token1, "token0 < token1 required");

        uint256 totalAmount0In = _pullTokens(
            metadata.token0,
            intents.intents0to1
        );
        uint256 totalAmount1In = _pullTokens(
            metadata.token1,
            intents.intents1to0
        );

        (
            uint256 totalToken1For0to1Users,
            uint256 totalToken0For1to0Users,
            uint256 netAmountToSwap,
            address tokenToSwap,
            address[] memory swapPath
        ) = _getMarketValuesAndCoW (
            metadata.router,
            metadata.token0,
            metadata.token1,
            totalAmount0In,
            totalAmount1In
        );

        uint256 amountReceivedFromSwap = 0;
        if (netAmountToSwap > 0) {

            IERC20(tokenToSwap).approve(metadata.router, netAmountToSwap);

            uint[] memory amountsOut = IUniswapV2Router02(metadata.router)
                .swapExactTokensForTokens(
                    netAmountToSwap,
                    1,
                    swapPath,
                    address(this),
                    block.timestamp
                );
            amountReceivedFromSwap = amountsOut[1];
        }

        if (tokenToSwap == metadata.token0) {
            totalToken1For0to1Users += amountReceivedFromSwap;
        } else if (tokenToSwap == metadata.token1) {
            totalToken0For1to0Users += amountReceivedFromSwap;
        }
        
        _distributeProportional(
            metadata.token1,
            intents.intents0to1,
            totalToken1For0to1Users,
            totalAmount0In
        );
        
         _distributeProportional(
            metadata.token0,
            intents.intents1to0,
            totalToken0For1to0Users,
            totalAmount1In
        );

        totalSwapsProcessed.add(intents.intents0to1.length + intents.intents1to0.length);
        totalVolumeInTokens.add(netAmountToSwap);

        emit BatchSettled(
            metadata.token0,
            metadata.token1,
            totalAmount0In,
            totalAmount1In,
            netAmountToSwap,
            tokenToSwap
        );
    }

    function _getMarketValuesAndCoW(
        address routerAddress,
        address token0,
        address token1,
        uint256 totalAmount0In,
        uint256 totalAmount1In
    ) private view returns (
        uint256 totalToken1For0to1Users,
        uint256 totalToken0For1to0Users,
        uint256 netAmountToSwap,
        address tokenToSwap,
        address[] memory swapPath
    ) {
        IUniswapV2Router02 router = IUniswapV2Router02(routerAddress);

        address[] memory path0to1 = new address[](2);
        path0to1[0] = token0;
        path0to1[1] = token1;

        address[] memory path1to0 = new address[](2);
        path1to0[0] = token1;
        path1to0[1] = token0;

        uint256 value0InTermsOf1 = 0;
        if (totalAmount0In > 0) {
            value0InTermsOf1 = router.getAmountsOut(totalAmount0In, path0to1)[1];
        }

        uint256 value1InTermsOf0 = 0;
        if (totalAmount1In > 0) {
            value1InTermsOf0 = router.getAmountsOut(totalAmount1In, path1to0)[1];
        }

        if (totalAmount0In >= value1InTermsOf0) {
            totalToken0For1to0Users = value1InTermsOf0;
            totalToken1For0to1Users = totalAmount1In;
            netAmountToSwap = totalAmount0In - value1InTermsOf0;
            tokenToSwap = token0;
            swapPath = path0to1;
        } else {
            totalToken1For0to1Users = value0InTermsOf1;
            totalToken0For1to0Users = totalAmount0In;
            netAmountToSwap = totalAmount1In - value0InTermsOf1;
            tokenToSwap = token1;
            swapPath = path1to0;
        }

        if (netAmountToSwap == 0) {
            tokenToSwap = address(0);
            swapPath = path0to1;
        }
    }

    function _pullTokens(address token, Intent[] memory intents) private returns (uint256 totalAmount) {
        for (uint i = 0; i < intents.length; i++) {
            uint256 amount = intents[i].amountIn;
            if (amount > 0) {
                totalAmount += amount;
                IERC20(token).transferFrom(intents[i].user, address(this), amount);
            }
        }
    }

    function _distributeProportional(
        address tokenOut,
        Intent[] memory intents,
        uint256 totalAmountOut,
        uint256 totalAmountIn
    ) private {
        if (totalAmountIn == 0) return;

        uint256 feeAmount = (totalAmountOut * 5) / 10000; // 0.05% fee rate

        uint256 distributableAmount = totalAmountOut - feeAmount;

        uint256 distributedSoFar = 0;

        for (uint i = 0; i < intents.length; i++) {
            if (i == intents.length - 1) {
                uint256 amountOut = distributableAmount - distributedSoFar; // Give remainders and all to last user
                if (amountOut > 0) {
                    IERC20(tokenOut).transfer(intents[i].user, amountOut);
                    emit UserSettled(intents[i].user, tokenOut, amountOut);
                }
            } else {
                uint256 amountOut = (intents[i].amountIn * distributableAmount) /
                    totalAmountIn;
                if (amountOut > 0) {
                    distributedSoFar += amountOut;
                    IERC20(tokenOut).transfer(intents[i].user, amountOut);
                    emit UserSettled(intents[i].user, tokenOut, amountOut);
                }
            }
        }
    }
}