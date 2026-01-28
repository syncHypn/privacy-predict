// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IPrivateToken } from "./interfaces/IPrivateToken.sol";

/// @title PrivateToken
/// @notice Manages encrypted balances for iPred protocol
/// @dev Inspired by Nocturne protocol - balances encrypted, TEE updates state
contract PrivateToken is IPrivateToken, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable collateral;
    address public teeAddress;

    mapping(address => bytes) private encryptedBalances;
    mapping(bytes32 => bool) private processedWithdrawals;
    mapping(address => bytes32) public pendingWithdrawals;

    uint256 public totalDeposited;
    uint256 public batchCounter;

    modifier onlyTEE() {
        if (msg.sender != teeAddress) revert NotTEE();
        _;
    }

    constructor(address _collateral, address _teeAddress) Ownable(msg.sender) {
        collateral = IERC20(_collateral);
        teeAddress = _teeAddress;
    }

    /// @notice Deposits collateral tokens into the private pool
    /// @param amount Amount of collateral to deposit
    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert InsufficientDeposit();

        collateral.safeTransferFrom(msg.sender, address(this), amount);

        totalDeposited += amount;

        // Generate commitment for TEE to process
        bytes32 commitment = keccak256(abi.encodePacked(msg.sender, amount, block.timestamp, block.number));

        emit Deposit(msg.sender, amount, commitment);
    }

    /// @notice Requests a withdrawal with encrypted amount
    /// @param commitmentHash Hash committing to withdrawal details
    /// @param encryptedAmount Encrypted withdrawal amount (for TEE)
    function requestWithdrawal(
        bytes32 commitmentHash,
        bytes calldata encryptedAmount
    ) external whenNotPaused nonReentrant {
        if (commitmentHash == bytes32(0)) revert InvalidCommitment();

        pendingWithdrawals[msg.sender] = commitmentHash;

        emit WithdrawalRequested(msg.sender, commitmentHash);
    }

    /// @notice Processes a withdrawal after TEE verification
    /// @param user User to withdraw to
    /// @param amount Amount to withdraw
    /// @param proof Proof of valid withdrawal from TEE
    function processWithdrawal(
        address user,
        uint256 amount,
        bytes calldata proof
    ) external onlyTEE whenNotPaused nonReentrant {
        bytes32 withdrawalId = keccak256(abi.encodePacked(user, amount, proof));

        if (processedWithdrawals[withdrawalId]) revert WithdrawalAlreadyProcessed();

        processedWithdrawals[withdrawalId] = true;
        pendingWithdrawals[user] = bytes32(0);
        totalDeposited -= amount;

        collateral.safeTransfer(user, amount);

        emit WithdrawalProcessed(user, amount);
    }

    /// @notice Batch updates encrypted balances after trades
    /// @param users Array of user addresses to update
    /// @param newEncryptedBalances Array of new encrypted balances
    /// @param stateRoot New state root after updates
    function batchUpdateBalances(
        address[] calldata users,
        bytes[] calldata newEncryptedBalances,
        bytes32 stateRoot
    ) external onlyTEE whenNotPaused {
        if (users.length != newEncryptedBalances.length) revert InvalidProof();

        for (uint256 i = 0; i < users.length; ) {
            encryptedBalances[users[i]] = newEncryptedBalances[i];
            unchecked { ++i; }
        }

        unchecked {
            ++batchCounter;
        }

        emit BalancesUpdated(batchCounter, stateRoot);
    }

    /// @notice Gets the encrypted balance for a user
    /// @param user The user address
    /// @return Encrypted balance bytes
    function getEncryptedBalance(address user) external view returns (bytes memory) {
        return encryptedBalances[user];
    }

    /// @notice Gets the collateral token address
    /// @return The collateral token contract
    function collateralToken() external view returns (address) {
        return address(collateral);
    }

    /// @notice Checks if a withdrawal has been processed
    /// @param withdrawalId The withdrawal identifier
    /// @return True if processed
    function isWithdrawalProcessed(bytes32 withdrawalId) external view returns (bool) {
        return processedWithdrawals[withdrawalId];
    }

    /// @notice Gets pending withdrawal commitment for a user
    /// @param user The user address
    /// @return The commitment hash
    function getPendingWithdrawal(address user) external view returns (bytes32) {
        return pendingWithdrawals[user];
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

    /// @notice Emergency withdrawal by owner
    /// @dev Only for emergency situations when TEE is unavailable
    /// @param token Token to withdraw
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function emergencyWithdraw(address token, address to, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = to.call{ value: amount }("");
            if (!success) revert TransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }
}
