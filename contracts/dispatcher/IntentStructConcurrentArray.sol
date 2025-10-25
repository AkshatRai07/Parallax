// SPDX-License-Identifier: MIT
pragma solidity >=0.7.0;

import "@arcologynetwork/concurrentlib/lib/core/Const.sol";
import "@arcologynetwork/concurrentlib/lib/core/Primitive.sol";

contract IntentStruct is Base {

    struct Intent {
        uint256 amount;
        address user;
        address token0;
        address token1;
        address router;
        uint256 deadline;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    constructor() Base(Const.BYTES, false) {}

    function push(Intent memory elem) public virtual {
        Base._set(uuid(), abi.encode(elem));
    }

    function delLast() public virtual returns (Intent memory) {
        return abi.decode(Base._delLast(), (Intent));
    }

    function get(uint256 idx) public virtual returns (Intent memory) {
        (bool exist, bytes memory data) = Base._get(idx);
        
        if (exist) {
            return abi.decode(data, (Intent));
        } else {
            Intent memory defaultRecord;
            return defaultRecord;
        }
    }

    function set(uint256 idx, Intent memory elem) public {
        Base._set(idx, abi.encode(elem));
    }
}