// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPrivateToken {
    event Deposit(address indexed user, uint256 amount, bytes32 indexed commitment);
    event WithdrawalRequested(address indexed user, bytes32 indexed commitmentHash);
    event WithdrawalProcessed(address indexed user, uint256 amount);
    event BalancesUpdated(uint256 indexed batchId, bytes32 stateRoot);

    error InsufficientDeposit();
    error InvalidProof();
    error NotTEE();
    error WithdrawalAlreadyProcessed();
    error InvalidCommitment();
    error TransferFailed();

    function deposit(uint256 amount) external;

    function requestWithdrawal(bytes32 commitmentHash, bytes calldata encryptedAmount) external;

    function processWithdrawal(
        address user,
        uint256 amount,
        bytes calldata proof
    ) external;

    function batchUpdateBalances(
        address[] calldata users,
        bytes[] calldata newEncryptedBalances,
        bytes32 stateRoot
    ) external;

    function getEncryptedBalance(address user) external view returns (bytes memory);

    function collateralToken() external view returns (address);
}
