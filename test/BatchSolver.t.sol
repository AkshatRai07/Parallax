// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Only those tests are here which can be executed in EVM runtime

import { Test } from "forge-std/Test.sol";
import { BatchSolver } from "../contracts/swapper/BatchSolver.sol";
import { IBatchSolver } from "../contracts/swapper/IBatchSolver.sol";

contract BatchSolverTest is Test {

    BatchSolver public batchSolver;
    address public keeper;
    address public notKeeper;

    function setUp() public {
        keeper = makeAddr("keeper");
        notKeeper = makeAddr("notKeeper");
        batchSolver = new BatchSolver(keeper);
    }

    // --- Constructor Tests ---

    function test_Constructor_SetsKeeper() public view {
        assertEq(batchSolver.keeper(), keeper, "Keeper address was not set correctly");
    }

    function test_Revert_Constructor_ZeroKeeper() public {
        vm.expectRevert("Keeper address cannot be zero");
        new BatchSolver(address(0));
    }

    // --- withdrawFees Tests ---

    function test_Revert_WithdrawFees_NotKeeper() public {
        vm.prank(notKeeper);
        vm.expectRevert("Only keeper");
        batchSolver.withdrawFees(address(makeAddr("token")));
    }

    // --- solveMultipleBatch Tests ---

    function test_Revert_SolveMultipleBatch_UnequalData() public {
        // --- Case 1: metadata.length > intentdata.length ---

        BatchSolver.PairMetadata[] memory metadata = new BatchSolver.PairMetadata[](1);
        metadata[0] = BatchSolver.PairMetadata({
            token0: makeAddr("token0"),
            token1: makeAddr("token1"),
            router: makeAddr("router")
        });

        BatchSolver.IntentData[] memory intentdata = new BatchSolver.IntentData[](0);

        vm.expectRevert("Unequal data given");
        batchSolver.solveMultipleBatch(metadata, intentdata);

        // --- Case 2: metadata.length < intentdata.length ---

        BatchSolver.PairMetadata[] memory metadata2 = new BatchSolver.PairMetadata[](0);
        BatchSolver.IntentData[] memory intentdata2 = new BatchSolver.IntentData[](1);
        intentdata2[0].intents0to1 = new BatchSolver.Intent[](0);
        intentdata2[0].intents1to0 = new BatchSolver.Intent[](0);

        vm.expectRevert("Unequal data given");
        batchSolver.solveMultipleBatch(metadata2, intentdata2);
    }
}
