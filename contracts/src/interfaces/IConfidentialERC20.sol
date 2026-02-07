// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IConfidentialERC20
/// @notice Interface for confidential ERC20 tokens with encrypted balances
/// @dev Per SPEC.md: Based on Nocturne Protocol - balances encrypted via EC
interface IConfidentialERC20 {
    // ============================================================================
    // Events (per SPEC.md)
    // ============================================================================

    /// @notice Emitted after TEE updates balances (no amounts visible)
    /// @param from Sender address
    /// @param to Receiver address
    event ConfidentialTransfer(address indexed from, address indexed to);

    /// @notice Emitted when deposit is requested (USDC -> cUSDC only)
    /// @param user User requesting deposit
    /// @param amount Clear amount being deposited
    event DepositRequested(address indexed user, uint256 amount);

    /// @notice Emitted when withdrawal is requested (cUSDC -> USDC only)
    /// @param user User requesting withdrawal
    /// @param encryptedAmount Encrypted amount to withdraw
    /// @param proof Optional ZK proof of sufficient balance
    event WithdrawRequested(
        address indexed user,
        bytes encryptedAmount,
        bytes proof
    );

    /// @notice Emitted when TEE updates encrypted balances
    /// @param user User whose balance was updated
    event BalanceUpdated(address indexed user);

    // ============================================================================
    // Errors
    // ============================================================================

    error NotTEE();
    error InsufficientBalance();
    error InvalidAmount();
    error InvalidProof();
    error TransferFailed();

    // ============================================================================
    // TEE Functions (per SPEC.md)
    // ============================================================================

    /// @notice Update encrypted balances after confidential transfer
    /// @dev Only callable by TEE after decrypt/compute/re-encrypt
    /// @param from Sender address
    /// @param newFromBalance New encrypted balance for sender
    /// @param to Receiver address
    /// @param newToBalance New encrypted balance for receiver
    function updateBalances(
        address from,
        bytes calldata newFromBalance,
        address to,
        bytes calldata newToBalance
    ) external;

    /// @notice Update a single user's encrypted balance
    /// @dev Only callable by TEE
    /// @param user User address
    /// @param newBalance New encrypted balance
    function updateBalance(address user, bytes calldata newBalance) external;

    // ============================================================================
    // View Functions
    // ============================================================================

    /// @notice Get encrypted balance for a user
    /// @param user User address
    /// @return Encrypted balance bytes (EC point commitment)
    function getEncryptedBalance(address user) external view returns (bytes memory);

    /// @notice Get the TEE address authorized to update balances
    /// @return TEE contract/EOA address
    function teeApp() external view returns (address);

    /// @notice Get total supply (may be public or encrypted)
    /// @return Total token supply
    function totalSupply() external view returns (uint256);

    /// @notice Get token name
    /// @return Token name
    function name() external view returns (string memory);

    /// @notice Get token symbol
    /// @return Token symbol
    function symbol() external view returns (string memory);

    /// @notice Get token decimals
    /// @return Number of decimals
    function decimals() external view returns (uint8);
}
