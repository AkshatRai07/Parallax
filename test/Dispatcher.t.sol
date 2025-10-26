// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Some tests in this file are commented out and a comment is added
// above them because they change Arcology's special types (like
// parallelizable arrays), and hence cannot be ran in an EVM 
// runtime, they shall be tested by arcology's frontend utils

import { Test, console } from "forge-std/Test.sol";
import { Dispatcher } from "../contracts/dispatcher/Dispatcher.sol";
import { IntentStruct } from "../contracts/dispatcher/IntentStructConcurrentArray.sol";
import { IBatchSolver } from "../contracts/swapper/IBatchSolver.sol";
import { MockBatchSolver } from "../contracts/mock/MockBatchSolver.sol";

contract DispatcherTest is Test {
    Dispatcher public dispatcher;
    MockBatchSolver public mockSolver;
    address public keeper;
    address public user1;
    address public user2;
    address public token0;
    address public token1;
    address public token2;
    address public router1;
    address public router2;

    IntentStruct internal intentContainer;

    function setUp() public {
        keeper = makeAddr("keeper");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        token0 = makeAddr("token0");
        token1 = makeAddr("token1");
        token2 = makeAddr("token2");
        router1 = makeAddr("router1");
        router2 = makeAddr("router2");

        mockSolver = new MockBatchSolver();

        dispatcher = new Dispatcher(address(mockSolver), keeper);

        intentContainer = dispatcher.intentContainer();
    }

    // --- helper functions ---

    function _createValidIntent() internal view returns (IntentStruct.Intent memory)
    {
        return
            IntentStruct.Intent({
                user: user1,
                token0: token0,
                token1: token1,
                router: router1,
                amount: 100 * 1e18,
                deadline: block.timestamp + 3600,
                v: 27,
                r: bytes32(uint256(1)),
                s: bytes32(uint256(2))
            });
    }

    // --- constructor Tests ---

    function test_Constructor_SetsAddresses() public view {
        assertEq(address(dispatcher.solver()), address(mockSolver));
        assertEq(dispatcher.keeper(), keeper);
    }

    function test_Constructor_InitializesContainers() public view {
        assertTrue(address(dispatcher.intentContainer()) != address(0));
        assertTrue(address(dispatcher.processingContainer()) != address(0));
        assertTrue(
            address(dispatcher.intentContainer()) != address(dispatcher.processingContainer())
        );
    }

    function test_Revert_Constructor_ZeroSolver() public {
        vm.expectRevert("Solver address cannot be zero");
        new Dispatcher(address(0), keeper);
    }

    function test_Revert_Constructor_ZeroKeeper() public {
        vm.expectRevert("Keeper address cannot be zero");
        new Dispatcher(address(mockSolver), address(0));
    }
   
    // --- addIntent Tests ---

    // *** Cannot run in EVM ***
    function test_AddIntent_Success() public {
        // IntentStruct.Intent memory intent = _createValidIntent();
        // assertEq(intentContainer.fullLength(), 0);
        // dispatcher.addIntent(intent);
        // assertEq(intentContainer.fullLength(), 1);

        // IntentStruct.Intent memory storedIntent = intentContainer.get(0);
        // assertEq(storedIntent.user, intent.user);
        // assertEq(storedIntent.token0, intent.token0);
        // assertEq(storedIntent.amount, intent.amount);
    }

    function test_Revert_AddIntent_ZeroUser() public {
        IntentStruct.Intent memory intent = _createValidIntent();
        intent.user = address(0);
        vm.expectRevert("User cannot be zero");
        dispatcher.addIntent(intent);
    }

    function test_Revert_AddIntent_ZeroToken0() public {
        IntentStruct.Intent memory intent = _createValidIntent();
        intent.token0 = address(0);
        vm.expectRevert("Token0 cannot be zero");
        dispatcher.addIntent(intent);
    }

    function test_Revert_AddIntent_ZeroToken1() public {
        IntentStruct.Intent memory intent = _createValidIntent();
        intent.token1 = address(0);
        vm.expectRevert("Token1 cannot be zero");
        dispatcher.addIntent(intent);
    }

    function test_Revert_AddIntent_SameTokens() public {
        IntentStruct.Intent memory intent = _createValidIntent();
        intent.token1 = intent.token0;
        vm.expectRevert("Tokens must be different");
        dispatcher.addIntent(intent);
    }

    function test_Revert_AddIntent_ZeroRouter() public {
        IntentStruct.Intent memory intent = _createValidIntent();
        intent.router = address(0);
        vm.expectRevert("Router cannot be zero");
        dispatcher.addIntent(intent);
    }

    function test_Revert_AddIntent_ZeroAmount() public {
        IntentStruct.Intent memory intent = _createValidIntent();
        intent.amount = 0;
        vm.expectRevert("Amount must be greater than zero");
        dispatcher.addIntent(intent);
    }

    function test_Revert_AddIntent_ExpiredDeadline() public {
        IntentStruct.Intent memory intent = _createValidIntent();
        intent.deadline = block.timestamp - 1;
        vm.expectRevert("Permit deadline expired");
        dispatcher.addIntent(intent);
    }

    // --- dispatch Tests ---

    function test_Revert_Dispatch_NotKeeper() public {
        vm.prank(user1);
        vm.expectRevert("Sender not keeper");
        dispatcher.dispatch();
    }

    // *** Cannot run in EVM ***
    function test_Dispatch_NoIntents() public {
        // assertEq(intentContainer.fullLength(), 0);
        
        // vm.prank(keeper);
        // dispatcher.dispatch();

        // // Solver should not be called
        // assertEq(mockSolver.callCount(), 0);
    }

    // *** Cannot run in EVM ***
    function test_Dispatch_ContainerSwapLogic() public {
        // IntentStruct.Intent memory intent = _createValidIntent();
        // dispatcher.addIntent(intent);

        // IntentStruct oldIntentContainer = dispatcher.intentContainer();
        // IntentStruct oldProcessingContainer = dispatcher.processingContainer();

        // assertEq(oldIntentContainer.fullLength(), 1);
        // assertEq(oldProcessingContainer.fullLength(), 0);

        // vm.prank(keeper);
        // dispatcher.dispatch();

        // IntentStruct newIntentContainer = dispatcher.intentContainer();
        // IntentStruct newProcessingContainer = dispatcher.processingContainer();

        // // The old 'processingContainer' is now the 'intentContainer'
        // assertEq(address(newIntentContainer), address(oldProcessingContainer));
        // // The old 'intentContainer' was processed (and is now inaccessible)
        // // A new 'processingContainer' was deployed
        // assertTrue(address(newProcessingContainer) != address(oldProcessingContainer));
        // assertTrue(address(newProcessingContainer) != address(oldIntentContainer));

        // // New containers should be empty
        // assertEq(newIntentContainer.fullLength(), 0);
        // assertEq(newProcessingContainer.fullLength(), 0);
    }

    // *** Cannot run in EVM ***
    function test_Dispatch_OneIntent_0to1() public {
        // // Ensure token0 < token1 for deterministic sorting
        // (token0, token1) = (token0 < token1) ? (token0, token1) : (token1, token0);

        // IntentStruct.Intent memory intent = _createValidIntent();
        // intent.token0 = token0;
        // intent.token1 = token1;
        // dispatcher.addIntent(intent);

        // vm.prank(keeper);
        // dispatcher.dispatch();

        // // Check solver was called
        // assertEq(mockSolver.callCount(), 1);

        // // Check data passed to solver
        // (
        //     IBatchSolver.PairMetadata[] memory metadata,
        //     IBatchSolver.IntentData[] memory intentdata
        // ) = mockSolver.getLastCall();

        // assertEq(metadata.length, 1);
        // assertEq(intentdata.length, 1);

        // assertEq(metadata[0].token0, token0);
        // assertEq(metadata[0].token1, token1);
        // assertEq(metadata[0].router, router1);

        // assertEq(intentdata[0].intents0to1.length, 1);
        // assertEq(intentdata[0].intents1to0.length, 0);
        // assertEq(intentdata[0].intents0to1[0].user, user1);
        // assertEq(intentdata[0].intents0to1[0].amountIn, intent.amount);
    }

    // *** Cannot run in EVM ***
    function test_Dispatch_OneIntent_1to0() public {
        // // Ensure token0 < token1 for deterministic sorting
        // (token0, token1) = (token0 < token1) ? (token0, token1) : (token1, token0);

        // IntentStruct.Intent memory intent = _createValidIntent();
        // // Swap tokens to create a 1 -> 0 intent
        // intent.token0 = token1;
        // intent.token1 = token0;
        // dispatcher.addIntent(intent);

        // vm.prank(keeper);
        // dispatcher.dispatch();

        // assertEq(mockSolver.callCount(), 1);
        // (
        //     IBatchSolver.PairMetadata[] memory metadata,
        //     IBatchSolver.IntentData[] memory intentdata
        // ) = mockSolver.getLastCall();

        // assertEq(metadata.length, 1);
        // assertEq(metadata[0].token0, token0); // Sorted
        // assertEq(metadata[0].token1, token1); // Sorted

        // assertEq(intentdata.length, 1);
        // assertEq(intentdata[0].intents0to1.length, 0);
        // assertEq(intentdata[0].intents1to0.length, 1);
        // assertEq(intentdata[0].intents1to0[0].user, user1);
        // assertEq(intentdata[0].intents1to0[0].amountIn, intent.amount);
    }

    // *** Cannot run in EVM ***
    function test_Dispatch_MultipleIntents_SamePair() public {
        // (token0, token1) = (token0 < token1) ? (token0, token1) : (token1, token0);

        // // Intent 1: 0 -> 1
        // IntentStruct.Intent memory intent1 = _createValidIntent();
        // intent1.token0 = token0;
        // intent1.token1 = token1;
        // intent1.user = user1;
        // intent1.amount = 100;
        // dispatcher.addIntent(intent1);

        // // Intent 2: 1 -> 0
        // IntentStruct.Intent memory intent2 = _createValidIntent();
        // intent2.token0 = token1;
        // intent2.token1 = token0;
        // intent2.user = user2;
        // intent2.amount = 200;
        // dispatcher.addIntent(intent2);

        // // Intent 3: 0 -> 1
        // IntentStruct.Intent memory intent3 = _createValidIntent();
        // intent3.token0 = token0;
        // intent3.token1 = token1;
        // intent3.user = user2;
        // intent3.amount = 300;
        // dispatcher.addIntent(intent3);

        // vm.prank(keeper);
        // dispatcher.dispatch();

        // assertEq(mockSolver.callCount(), 1);
        // (
        //     IBatchSolver.PairMetadata[] memory metadata,
        //     IBatchSolver.IntentData[] memory intentdata
        // ) = mockSolver.getLastCall();

        // // Should be 1 batch
        // assertEq(metadata.length, 1);
        // assertEq(intentdata.length, 1);

        // assertEq(metadata[0].token0, token0);
        // assertEq(metadata[0].token1, token1);

        // // Check intents are batched correctly
        // assertEq(intentdata[0].intents0to1.length, 2);
        // assertEq(intentdata[0].intents1to0.length, 1);

        // assertEq(intentdata[0].intents0to1[0].user, user1);
        // assertEq(intentdata[0].intents0to1[0].amountIn, 100);
        // assertEq(intentdata[0].intents0to1[1].user, user2);
        // assertEq(intentdata[0].intents0to1[1].amountIn, 300);

        // assertEq(intentdata[0].intents1to0[0].user, user2);
        // assertEq(intentdata[0].intents1to0[0].amountIn, 200);
    }

    // *** Cannot run in EVM ***
    function test_Dispatch_MultipleIntents_DifferentPairs() public {
        // // Pair 1: token0, token1, router1
        // (token0, token1) = (token0 < token1) ? (token0, token1) : (token1, token0);
        // IntentStruct.Intent memory intent1 = _createValidIntent();
        // intent1.token0 = token0;
        // intent1.token1 = token1;
        // intent1.router = router1;
        // intent1.user = user1;
        // dispatcher.addIntent(intent1);

        // // Pair 2: token1, token2, router1
        // (token1, token2) = (token1 < token2) ? (token1, token2) : (token2, token1);
        // IntentStruct.Intent memory intent2 = _createValidIntent();
        // intent2.token0 = token1;
        // intent2.token1 = token2;
        // intent2.router = router1;
        // intent2.user = user2;
        // dispatcher.addIntent(intent2);

        // // Pair 3: token0, token1, router2
        // IntentStruct.Intent memory intent3 = _createValidIntent();
        // intent3.token0 = token1; // 1 -> 0
        // intent3.token1 = token0;
        // intent3.router = router2;
        // intent3.user = user2;
        // dispatcher.addIntent(intent3);

        // vm.prank(keeper);
        // dispatcher.dispatch();

        // assertEq(mockSolver.callCount(), 1);
        // (
        //     IBatchSolver.PairMetadata[] memory metadata,
        //     IBatchSolver.IntentData[] memory intentdata
        // ) = mockSolver.getLastCall();

        // // Should be 3 batches
        // assertEq(metadata.length, 3);
        // assertEq(intentdata.length, 3);

        // // Note: The order of batches is not guaranteed, as it depends on
        // // the iteration order. We must find the batch, not assume its index.
        
        // bool[3] memory found;

        // for (uint i = 0; i < 3; i++) {
        //     if (
        //         metadata[i].token0 == token0 &&
        //         metadata[i].token1 == token1 &&
        //         metadata[i].router == router1
        //     ) {
        //         // Batch 1 (t0, t1, r1)
        //         assertEq(intentdata[i].intents0to1.length, 1);
        //         assertEq(intentdata[i].intents1to0.length, 0);
        //         assertEq(intentdata[i].intents0to1[0].user, user1);
        //         found[0] = true;
        //     } else if (
        //         metadata[i].token0 == token1 &&
        //         metadata[i].token1 == token2 &&
        //         metadata[i].router == router1
        //     ) {
        //         // Batch 2 (t1, t2, r1)
        //         assertEq(intentdata[i].intents0to1.length, 1);
        //         assertEq(intentdata[i].intents1to0.length, 0);
        //         assertEq(intentdata[i].intents0to1[0].user, user2);
        //         found[1] = true;
        //     } else if (
        //         metadata[i].token0 == token0 &&
        //         metadata[i].token1 == token1 &&
        //         metadata[i].router == router2
        //     ) {
        //         // Batch 3 (t0, t1, r2)
        //         assertEq(intentdata[i].intents0to1.length, 0);
        //         assertEq(intentdata[i].intents1to0.length, 1);
        //         assertEq(intentdata[i].intents1to0[0].user, user2);
        //         found[2] = true;
        //     }
        // }

        // assertTrue(found[0], "Batch 1 not found");
        // assertTrue(found[1], "Batch 2 not found");
        // assertTrue(found[2], "Batch 3 not found");
    }
}
