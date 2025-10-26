// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

// This contract is marked 'abstract' because it does not implement
// all functions from the IUniswapV2Router02 interface (e.g., liquidity functions).
contract MockUniswapRouter is IUniswapV2Router02 {
    address public immutable wethAddress;

    // rate[tokenIn][tokenOut] = amountOut for 1e18 tokenIn
    mapping(address => mapping(address => uint256)) public rates;

    constructor(address _weth) {
        wethAddress = _weth;
    }

    // --- Config Function ---
    function setRate(
        address tokenIn,
        address tokenOut,
        uint256 rate
    ) external {
        rates[tokenIn][tokenOut] = rate;
    }

    // --- Implemented Functions ---

    function factory() external pure virtual override returns (address) {
        return address(0); // Mock address
    }

    function WETH() external pure virtual override returns (address) {
        return 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    }

    function getAmountsOut(
        uint amountIn,
        address[] memory path
    ) public view virtual override returns (uint[] memory amounts) {
        require(path.length == 2, "Mock: Path > 2");
        amounts = new uint[](2);
        amounts[0] = amountIn;
        uint256 rate = rates[path[0]][path[1]];
        if (rate == 0) rate = 1e18; // Default 1:1 if not set
        amounts[1] = (amountIn * rate) / 1e18;
    }

    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override returns (uint[] memory amounts) {
        require(path.length == 2, "Mock: Path > 2");
        address tokenIn = path[0];
        address tokenOut = path[1];

        amounts = new uint[](2);
        amounts[0] = amountIn;
        uint256 rate = rates[tokenIn][tokenOut];
        if (rate == 0) rate = 1e18; // Default 1:1 if not set
        amounts[1] = (amountIn * rate) / 1e18;

        require(amounts[1] >= amountOutMin, "Mock: Slippage");
        
        // Pull tokens from solver
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        // Send tokens to solver
        IERC20(tokenOut).transfer(to, amounts[1]);
    }

    // --- Unimplemented Stubs ---
    // Add stubs for all other functions to satisfy the interface

    function swapTokensForExactTokens(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override returns (uint[] memory amounts) {}

    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable virtual override returns (uint[] memory amounts) {}

    function swapTokensForExactETH(
        uint amountOut,
        uint amountInMax,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override returns (uint[] memory amounts) {}

    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override returns (uint[] memory amounts) {}

    function swapETHForExactTokens(
        uint amountOut,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable virtual override returns (uint[] memory amounts) {}

    function quote(
        uint amountA,
        uint reserveA,
        uint reserveB
    ) public pure virtual override returns (uint amountB) {}

    function getAmountOut(
        uint amountIn,
        uint reserveIn,
        uint reserveOut
    ) public pure virtual override returns (uint amountOut) {}

    function getAmountIn(
        uint amountOut,
        uint reserveIn,
        uint reserveOut
    ) public pure virtual override returns (uint amountIn) {}

    function getAmountsIn(
        uint amountOut,
        address[] memory path
    ) public view virtual override returns (uint[] memory amounts) {}

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external virtual override returns (uint, uint, uint) {}

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable virtual override returns (uint, uint, uint) {}

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external virtual override returns (uint, uint) {}

    function removeLiquidityETH(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external virtual override returns (uint, uint) {}

    function removeLiquidityWithPermit(
        address tokenA,
        address tokenB,
        uint liquidity,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external virtual override returns (uint, uint) {}

    function removeLiquidityETHWithPermit(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external virtual override returns (uint, uint) {}
    
    function removeLiquidityETHSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external virtual override returns (uint) {}

    function removeLiquidityETHWithPermitSupportingFeeOnTransferTokens(
        address token,
        uint liquidity,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline,
        bool approveMax,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external virtual override returns (uint) {}

    function swapExactTokensForTokensSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override {}

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable virtual override {}

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external virtual override {}
}
