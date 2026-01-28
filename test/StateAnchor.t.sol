// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { StateAnchor } from "../src/StateAnchor.sol";
import { IStateAnchor } from "../src/interfaces/IStateAnchor.sol";

contract StateAnchorTest is Test {
    StateAnchor public stateAnchor;

    address public owner = address(this);
    address public tee = makeAddr("tee");
    address public user = makeAddr("user");

    bytes public attestation = hex"deadbeef";
    bytes32 public matchId = keccak256("match-1");

    event StateUpdated(
        uint256 indexed version,
        bytes32 indexed newRoot,
        bytes32 indexed previousRoot,
        bytes32 matchId
    );

    function setUp() public {
        stateAnchor = new StateAnchor(tee);
    }

    // ============ Initialization Tests ============

    function test_InitialState() public view {
        assertEq(stateAnchor.stateVersion(), 0);
        assertEq(stateAnchor.teeAddress(), tee);

        bytes32 genesisRoot = keccak256(abi.encodePacked("iPred-genesis"));
        assertEq(stateAnchor.currentRoot(), genesisRoot);
        assertTrue(stateAnchor.isRootCommitted(genesisRoot));
    }

    // ============ Root Commit Tests ============

    function test_CommitRoot() public {
        bytes32 newRoot = keccak256("root-1");

        vm.prank(tee);
        stateAnchor.commitRoot(newRoot, matchId, attestation);

        assertEq(stateAnchor.currentRoot(), newRoot);
        assertEq(stateAnchor.stateVersion(), 1);
        assertTrue(stateAnchor.isRootCommitted(newRoot));
    }

    function test_CommitRoot_EmitsEvent() public {
        bytes32 newRoot = keccak256("root-1");
        bytes32 previousRoot = stateAnchor.currentRoot();

        vm.prank(tee);
        vm.expectEmit(true, true, true, true);
        emit StateUpdated(1, newRoot, previousRoot, matchId);
        stateAnchor.commitRoot(newRoot, matchId, attestation);
    }

    function test_CommitRoot_MultipleCommits() public {
        bytes32 root1 = keccak256("root-1");
        bytes32 root2 = keccak256("root-2");
        bytes32 root3 = keccak256("root-3");

        vm.startPrank(tee);
        stateAnchor.commitRoot(root1, matchId, attestation);
        stateAnchor.commitRoot(root2, keccak256("match-2"), attestation);
        stateAnchor.commitRoot(root3, keccak256("match-3"), attestation);
        vm.stopPrank();

        assertEq(stateAnchor.stateVersion(), 3);
        assertEq(stateAnchor.currentRoot(), root3);

        // All roots should be queryable
        assertEq(stateAnchor.getRootAtVersion(1), root1);
        assertEq(stateAnchor.getRootAtVersion(2), root2);
        assertEq(stateAnchor.getRootAtVersion(3), root3);
    }

    function test_CommitRoot_RevertWhen_NotTEE() public {
        bytes32 newRoot = keccak256("root-1");

        vm.prank(user);
        vm.expectRevert(IStateAnchor.NotTEE.selector);
        stateAnchor.commitRoot(newRoot, matchId, attestation);
    }

    function test_CommitRoot_RevertWhen_EmptyAttestation() public {
        bytes32 newRoot = keccak256("root-1");

        vm.prank(tee);
        vm.expectRevert(IStateAnchor.InvalidAttestation.selector);
        stateAnchor.commitRoot(newRoot, matchId, "");
    }

    function test_CommitRoot_RevertWhen_Paused() public {
        stateAnchor.pause();

        bytes32 newRoot = keccak256("root-1");

        vm.prank(tee);
        vm.expectRevert();
        stateAnchor.commitRoot(newRoot, matchId, attestation);
    }

    // ============ Root Query Tests ============

    function test_GetRootAtVersion() public {
        bytes32 root1 = keccak256("root-1");

        vm.prank(tee);
        stateAnchor.commitRoot(root1, matchId, attestation);

        bytes32 genesisRoot = keccak256(abi.encodePacked("iPred-genesis"));
        assertEq(stateAnchor.getRootAtVersion(0), genesisRoot);
        assertEq(stateAnchor.getRootAtVersion(1), root1);
    }

    function test_GetRootAtVersion_RevertWhen_VersionNotCommitted() public {
        vm.expectRevert(IStateAnchor.VersionNotCommitted.selector);
        stateAnchor.getRootAtVersion(999);
    }

    function test_IsRootCommitted() public {
        bytes32 newRoot = keccak256("root-1");
        bytes32 unknownRoot = keccak256("unknown");

        assertFalse(stateAnchor.isRootCommitted(unknownRoot));

        vm.prank(tee);
        stateAnchor.commitRoot(newRoot, matchId, attestation);

        assertTrue(stateAnchor.isRootCommitted(newRoot));
        assertFalse(stateAnchor.isRootCommitted(unknownRoot));
    }

    function test_GetVersionForRoot() public {
        bytes32 root1 = keccak256("root-1");
        bytes32 root2 = keccak256("root-2");

        vm.startPrank(tee);
        stateAnchor.commitRoot(root1, matchId, attestation);
        stateAnchor.commitRoot(root2, keccak256("match-2"), attestation);
        vm.stopPrank();

        assertEq(stateAnchor.getVersionForRoot(root1), 1);
        assertEq(stateAnchor.getVersionForRoot(root2), 2);
    }

    function test_GetVersionForRoot_RevertWhen_RootNotCommitted() public {
        bytes32 unknownRoot = keccak256("unknown");

        vm.expectRevert(IStateAnchor.RootNotCommitted.selector);
        stateAnchor.getVersionForRoot(unknownRoot);
    }

    // ============ Proof Verification Tests ============

    function test_VerifyProof_BasicCheck() public {
        bytes32 newRoot = keccak256("root-1");

        vm.prank(tee);
        stateAnchor.commitRoot(newRoot, matchId, attestation);

        bytes memory key = "user:0x123:balance";
        bytes memory value = abi.encode(1000);
        bytes[] memory proof = new bytes[](1);
        proof[0] = abi.encodePacked(key, value);

        // MVP implementation always returns true for valid roots
        bool valid = stateAnchor.verifyProof(newRoot, key, value, proof);
        assertTrue(valid);
    }

    function test_VerifyProof_RevertWhen_RootNotCommitted() public {
        bytes32 unknownRoot = keccak256("unknown-root");
        bytes memory key = "test";
        bytes memory value = "value";
        bytes[] memory proof = new bytes[](1);
        proof[0] = "proof";

        vm.expectRevert(IStateAnchor.RootNotCommitted.selector);
        stateAnchor.verifyProof(unknownRoot, key, value, proof);
    }

    // ============ Admin Function Tests ============

    function test_SetTEEAddress() public {
        address newTee = makeAddr("newTee");
        stateAnchor.setTEEAddress(newTee);
        assertEq(stateAnchor.teeAddress(), newTee);
    }

    function test_SetTEEAddress_RevertWhen_NotOwner() public {
        vm.prank(user);
        vm.expectRevert();
        stateAnchor.setTEEAddress(user);
    }

    function test_Pause_Unpause() public {
        stateAnchor.pause();
        assertTrue(stateAnchor.paused());

        stateAnchor.unpause();
        assertFalse(stateAnchor.paused());
    }
}
