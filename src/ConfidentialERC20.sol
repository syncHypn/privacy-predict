// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IConfidentialERC20 } from "./interfaces/IConfidentialERC20.sol";

/// @title ConfidentialERC20
/// @notice Base contract for confidential ERC20 tokens with encrypted balances
/// @dev Per SPEC.md: Based on Nocturne Protocol
/// Balances are encrypted via elliptic curve (Pedersen commitment style)
/// Only the TEE can decrypt, compute, and re-encrypt balances
abstract contract ConfidentialERC20 is IConfidentialERC20, Ownable, Pausable, ReentrancyGuard {
    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice Token name
    string private _name;

    /// @notice Token symbol
    string private _symbol;

    /// @notice Token decimals (matches USDC = 6)
    uint8 private constant _decimals = 6;

    /// @notice Encrypted balances per user
    /// @dev Per SPEC.md: Each balance is an EC point (commitment)
    mapping(address => bytes) private _encryptedBalances;

    /// @notice TEE address authorized to modify balances
    address public override teeApp;

    /// @notice Total supply (can be public for market health visibility)
    uint256 private _totalSupply;

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyTEE() {
        if (msg.sender != teeApp) revert NotTEE();
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    /// @notice Initialize the confidential token
    /// @param tokenName Token name
    /// @param tokenSymbol Token symbol
    /// @param _teeApp TEE address for balance updates
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address _teeApp
    ) Ownable(msg.sender) {
        _name = tokenName;
        _symbol = tokenSymbol;
        teeApp = _teeApp;
    }

    // ============================================================================
    // TEE Functions (per SPEC.md)
    // ============================================================================

    /// @inheritdoc IConfidentialERC20
    function updateBalances(
        address from,
        bytes calldata newFromBalance,
        address to,
        bytes calldata newToBalance
    ) external override onlyTEE whenNotPaused {
        _encryptedBalances[from] = newFromBalance;
        _encryptedBalances[to] = newToBalance;

        emit BalanceUpdated(from);
        emit BalanceUpdated(to);
        emit ConfidentialTransfer(from, to);
    }

    /// @inheritdoc IConfidentialERC20
    function updateBalance(address user, bytes calldata newBalance)
        external
        override
        onlyTEE
        whenNotPaused
    {
        _encryptedBalances[user] = newBalance;
        emit BalanceUpdated(user);
    }

    // ============================================================================
    // Internal Functions
    // ============================================================================

    /// @notice Mint tokens (increase supply)
    /// @dev Called during deposit flow
    /// @param amount Amount to mint
    function _mint(uint256 amount) internal {
        _totalSupply += amount;
    }

    /// @notice Burn tokens (decrease supply)
    /// @dev Called during withdrawal flow
    /// @param amount Amount to burn
    function _burn(uint256 amount) internal {
        if (_totalSupply < amount) revert InsufficientBalance();
        _totalSupply -= amount;
    }

    /// @notice Set encrypted balance directly (for internal use)
    /// @param user User address
    /// @param encryptedBalance New encrypted balance
    function _setEncryptedBalance(address user, bytes memory encryptedBalance) internal {
        _encryptedBalances[user] = encryptedBalance;
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /// @inheritdoc IConfidentialERC20
    function getEncryptedBalance(address user)
        external
        view
        override
        returns (bytes memory)
    {
        return _encryptedBalances[user];
    }

    /// @inheritdoc IConfidentialERC20
    function totalSupply() external view override returns (uint256) {
        return _totalSupply;
    }

    /// @inheritdoc IConfidentialERC20
    function name() external view override returns (string memory) {
        return _name;
    }

    /// @inheritdoc IConfidentialERC20
    function symbol() external view override returns (string memory) {
        return _symbol;
    }

    /// @inheritdoc IConfidentialERC20
    function decimals() external pure override returns (uint8) {
        return _decimals;
    }

    // ============================================================================
    // Admin Functions
    // ============================================================================

    /// @notice Update TEE address
    /// @param _teeApp New TEE address
    function setTEEApp(address _teeApp) external onlyOwner {
        teeApp = _teeApp;
    }

    /// @notice Pause the contract
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpause the contract
    function unpause() external onlyOwner {
        _unpause();
    }
}

/// @title ConfidentialUSDC
/// @notice Confidential USDC (cUSDC) token
/// @dev Per SPEC.md & IAPP_ORACLE_ALTERNATIVE.md:
/// Wraps USDC deposits into encrypted balances
/// Uses iExec oracle pattern for TEE operations
contract ConfidentialUSDC is ConfidentialERC20 {
    using SafeERC20 for IERC20;

    /// @notice Underlying USDC token
    IERC20 public immutable usdc;

    constructor(address _usdc, address _teeApp)
        ConfidentialERC20("Confidential USDC", "cUSDC", _teeApp)
    {
        usdc = IERC20(_usdc);
    }

    /// @notice Deposit USDC to receive cUSDC
    /// @dev TEE monitors event and encrypts balance
    /// @param amount USDC amount to deposit
    function deposit(uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert InvalidAmount();

        // Transfer USDC from user
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        // Mint cUSDC supply
        _mint(amount);

        // TEE will monitor this event, encrypt the amount, and call updateBalance
        emit DepositRequested(msg.sender, amount);
    }

    /// @notice Request withdrawal of cUSDC for USDC
    /// @dev TEE monitors event and processes withdrawal
    /// @param encryptedAmount Encrypted amount to withdraw
    /// @param proof Optional ZK proof (for post-MVP)
    function withdraw(bytes calldata encryptedAmount, bytes calldata proof)
        external
        whenNotPaused
        nonReentrant
    {
        if (encryptedAmount.length == 0) revert InvalidAmount();

        // TEE will monitor this event, decrypt amount, verify balance, and process withdrawal
        emit WithdrawRequested(msg.sender, encryptedAmount, proof);
    }

    /// @notice Process withdrawal after TEE verification
    /// @dev Called by TEE after verifying encrypted balance
    /// @param user User to send USDC to
    /// @param amount Amount to withdraw
    function processWithdrawal(address user, uint256 amount) external onlyTEE whenNotPaused {
        // Burn cUSDC supply
        _burn(amount);

        // Transfer USDC to user
        usdc.safeTransfer(user, amount);

        emit BalanceUpdated(user);
    }
}

/// @title ConfidentialOutcomeToken
/// @notice Confidential outcome token (cYES or cNO) for a specific market
/// @dev Per SPEC.md: Created per market, only tradeable via AMM
contract ConfidentialOutcomeToken is ConfidentialERC20 {
    /// @notice Market this token belongs to
    bytes32 public immutable marketId;

    /// @notice Whether this is a YES token (false = NO)
    bool public immutable isYes;

    /// @notice PredictionMarket contract that can mint/burn
    address public immutable predictionMarket;

    error NotPredictionMarket();

    modifier onlyPredictionMarket() {
        if (msg.sender != predictionMarket) revert NotPredictionMarket();
        _;
    }

    constructor(
        bytes32 _marketId,
        bool _isYes,
        address _predictionMarket,
        address _teeApp
    )
        ConfidentialERC20(
            _isYes ? "Confidential YES" : "Confidential NO",
            _isYes ? "cYES" : "cNO",
            _teeApp
        )
    {
        marketId = _marketId;
        isYes = _isYes;
        predictionMarket = _predictionMarket;
    }

    /// @notice Mint tokens during AMM buy
    /// @dev Only TEE can mint via balance updates
    /// @param amount Amount to mint (for supply tracking)
    function mint(uint256 amount) external onlyTEE {
        _mint(amount);
    }

    /// @notice Burn tokens during AMM sell or redemption
    /// @dev Only TEE can burn via balance updates
    /// @param amount Amount to burn (for supply tracking)
    function burn(uint256 amount) external onlyTEE {
        _burn(amount);
    }
}

// Required import for SafeERC20
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
