// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IStateAnchor } from "./interfaces/IStateAnchor.sol";
import { MerklePatriciaProof } from "./libraries/MerklePatriciaProof.sol";

/// @title StateAnchor
/// @notice Anchors PMT state roots on-chain for verifiable order book state
/// @dev TEE commits roots after every match for trustless verification
contract StateAnchor is IStateAnchor, Ownable, Pausable {
    using MerklePatriciaProof for bytes32;

    bytes32 public currentRoot;
    uint256 public stateVersion;
    address public teeAddress;

    mapping(uint256 => bytes32) public rootHistory;
    mapping(bytes32 => uint256) public rootVersions;

    modifier onlyTEE() {
        if (msg.sender != teeAddress) revert NotTEE();
        _;
    }

    constructor(address _teeAddress) Ownable(msg.sender) {
        teeAddress = _teeAddress;

        // Initialize with empty root
        bytes32 genesisRoot = keccak256(abi.encodePacked("iPred-genesis"));
        currentRoot = genesisRoot;
        rootHistory[0] = genesisRoot;
        rootVersions[genesisRoot] = 0;

        emit StateUpdated(0, genesisRoot, bytes32(0), bytes32(0));
    }

    /// @notice Commits a new PMT root after a match
    /// @param newRoot The new state root hash
    /// @param matchId Identifier of the match that produced this state
    /// @param teeAttestation Intel SGX attestation proving TEE execution
    function commitRoot(
        bytes32 newRoot,
        bytes32 matchId,
        bytes calldata teeAttestation
    ) external onlyTEE whenNotPaused {
        if (!_verifyAttestation(teeAttestation)) revert InvalidAttestation();

        bytes32 previousRoot = currentRoot;

        unchecked {
            ++stateVersion;
        }

        currentRoot = newRoot;
        rootHistory[stateVersion] = newRoot;
        rootVersions[newRoot] = stateVersion;

        emit StateUpdated(stateVersion, newRoot, previousRoot, matchId);
    }

    /// @notice Verifies a Merkle Patricia proof against a committed root
    /// @param root The root to verify against
    /// @param key The key being proven
    /// @param value The expected value
    /// @param proof The proof nodes
    /// @return valid True if the proof is valid
    function verifyProof(
        bytes32 root,
        bytes memory key,
        bytes memory value,
        bytes[] memory proof
    ) external view returns (bool valid) {
        if (rootVersions[root] == 0 && root != rootHistory[0]) revert RootNotCommitted();

        return MerklePatriciaProof.verify(root, key, value, proof);
    }

    /// @notice Gets the root hash at a specific version
    /// @param version The state version to query
    /// @return root The root hash at that version
    function getRootAtVersion(uint256 version) external view returns (bytes32 root) {
        if (version > stateVersion) revert VersionNotCommitted();
        return rootHistory[version];
    }

    /// @notice Checks if a root has been committed
    /// @param root The root to check
    /// @return True if committed
    function isRootCommitted(bytes32 root) external view returns (bool) {
        return rootVersions[root] > 0 || root == rootHistory[0];
    }

    /// @notice Gets the version number for a specific root
    /// @param root The root to query
    /// @return version The version number
    function getVersionForRoot(bytes32 root) external view returns (uint256 version) {
        version = rootVersions[root];
        if (version == 0 && root != rootHistory[0]) revert RootNotCommitted();
    }

    /// @notice Verifies TEE attestation
    /// @dev Simplified for MVP - full implementation would verify Intel SGX attestation
    /// @param attestation The attestation bytes
    /// @return valid True if attestation is valid
    function _verifyAttestation(bytes calldata attestation) internal pure returns (bool valid) {
        // MVP: Accept any non-empty attestation
        // Production: Verify Intel SGX quote structure and signature
        return attestation.length > 0;
    }

    // Admin functions

    /// @notice Sets the TEE address
    /// @param _teeAddress New TEE address
    function setTEEAddress(address _teeAddress) external onlyOwner {
        teeAddress = _teeAddress;
    }

    /// @notice Pauses the contract
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses the contract
    function unpause() external onlyOwner {
        _unpause();
    }
}
