// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Doge is ERC20, Ownable, ERC20Permit {
    constructor() ERC20("Doge", "Doge") Ownable(msg.sender) ERC20Permit("Doge") {}

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}
