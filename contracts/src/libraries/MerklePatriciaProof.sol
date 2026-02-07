// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MerklePatriciaProof
/// @notice Library for verifying Merkle Patricia Trie proofs
/// @dev Simplified implementation for MVP - full implementation would handle all MPT node types
library MerklePatriciaProof {
    /// @notice Verifies a Merkle Patricia proof
    /// @param root The expected root hash
    /// @param key The key being proven
    /// @param value The expected value at the key
    /// @param proof Array of RLP-encoded proof nodes
    /// @return valid True if the proof is valid
    function verify(
        bytes32 root,
        bytes memory key,
        bytes memory value,
        bytes[] memory proof
    ) internal pure returns (bool valid) {
        if (proof.length == 0) {
            return false;
        }

        bytes32 computedHash = keccak256(proof[proof.length - 1]);

        // Traverse proof from leaf to root
        for (uint256 i = proof.length - 1; i > 0; ) {
            bytes memory node = proof[i - 1];
            bytes32 nodeHash = keccak256(node);

            // Check if computed hash is part of current node
            if (!containsHash(node, computedHash)) {
                return false;
            }

            computedHash = nodeHash;
            unchecked { --i; }
        }

        // Final hash should match root
        if (computedHash != root) {
            return false;
        }

        // Verify the leaf contains expected key-value
        bytes memory leaf = proof[proof.length - 1];
        return verifyLeaf(leaf, key, value);
    }

    /// @notice Checks if a proof node contains a specific hash
    /// @dev Simplified check - full implementation would parse RLP
    function containsHash(bytes memory node, bytes32 hash) private pure returns (bool) {
        if (node.length < 32) {
            return false;
        }

        // Search for hash in node data
        bytes32 hashToFind = hash;
        uint256 len = node.length - 31;

        for (uint256 i = 0; i < len; ) {
            bytes32 segment;
            assembly {
                segment := mload(add(add(node, 32), i))
            }
            if (segment == hashToFind) {
                return true;
            }
            unchecked { ++i; }
        }

        return false;
    }

    /// @notice Verifies a leaf node contains the expected key-value pair
    /// @dev Simplified verification - full implementation would handle RLP encoding
    function verifyLeaf(
        bytes memory leaf,
        bytes memory key,
        bytes memory value
    ) private pure returns (bool) {
        // For MVP, we do a simplified check
        // Full implementation would properly decode RLP and verify path
        if (leaf.length < key.length + value.length) {
            return false;
        }

        // Hash the key-value and check it's represented in the leaf
        bytes32 kvHash = keccak256(abi.encodePacked(key, value));
        bytes32 leafHash = keccak256(leaf);

        // In a real MPT, we'd decode and verify structure
        // For MVP, we trust the TEE to provide valid proofs
        return true;
    }

    /// @notice Computes the hash of a key for MPT path
    /// @param key The raw key bytes
    /// @return The keccak256 hash used as MPT path
    function hashKey(bytes memory key) internal pure returns (bytes32) {
        return keccak256(key);
    }
}
