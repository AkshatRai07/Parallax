// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Some tests in this file are commented out and a comment is added
// above them because they change Arcology's special types (like
// parallelizable arrays), and hence cannot be ran in an EVM or
// NodeJS/Mocha runtime, they shall be tested by arcology's frontend utils

import { Test, console } from "forge-std/Test.sol";
import { Dispatcher } from "../contracts/dispatcher/Dispatcher.sol";
import { IntentStruct } from "../contracts/dispatcher/IntentStructConcurrentArray.sol";
import { IBatchSolver } from "../contracts/swapper/IBatchSolver.sol";

// Mock implementation of the IBatchSolver to simulate its behavior and check if it's called correctly.
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
}
