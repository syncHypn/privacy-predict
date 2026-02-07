// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStateAnchor {
    event StateUpdated(
        uint256 indexed version,
        bytes32 indexed newRoot,
        bytes32 indexed previousRoot,
        bytes32 matchId
    );

    error InvalidAttestation();
    error NotTEE();
    error RootNotCommitted();
    error VersionNotCommitted();
    error InvalidProof();

    function commitRoot(bytes32 newRoot, bytes32 matchId, bytes calldata teeAttestation) external;

    function verifyProof(
        bytes32 root,
        bytes memory key,
        bytes memory value,
        bytes[] memory proof
    ) external view returns (bool);

    function currentRoot() external view returns (bytes32);

    function stateVersion() external view returns (uint256);

    function getRootAtVersion(uint256 version) external view returns (bytes32);

    function isRootCommitted(bytes32 root) external view returns (bool);
}
