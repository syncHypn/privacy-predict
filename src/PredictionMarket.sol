// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IPredictionMarket } from "./interfaces/IPredictionMarket.sol";
import { IMarketFactory } from "./interfaces/IMarketFactory.sol";

/// @title PredictionMarket
/// @notice Confidential AMM for prediction market trading
/// @dev Per SPEC.md: Handles buy/sell of cYES/cNO tokens via constant product AMM
/// All actual computations happen in the TEE - this contract only emits events
/// and stores public indicative prices
contract PredictionMarket is IPredictionMarket, Ownable, Pausable, ReentrancyGuard {
    // ============================================================================
    // State Variables
    // ============================================================================

    /// @notice MarketFactory contract for market validation
    address public immutable override marketFactory;

    /// @notice Confidential USDC token address
    address public immutable override cUSDC;

    /// @notice TEE address authorized to update state
    address public teeAddress;

    /// @notice TEE public key for order encryption (X25519)
    bytes public teePublicKey;

    /// @notice Pool state per market
    struct PoolState {
        bool initialized;
        uint256 priceYes;      // Scaled by 1e4 (5000 = 50%)
        uint256 priceNo;       // Scaled by 1e4
        uint256 lastUpdate;    // Timestamp
        uint256 initialLiquidity;
    }

    /// @notice Pool state mapping
    mapping(bytes32 => PoolState) private pools;

    /// @notice Track if user has redeemed for a market
    mapping(bytes32 => mapping(address => bool)) public hasRedeemed;

    // ============================================================================
    // Modifiers
    // ============================================================================

    modifier onlyTEE() {
        if (msg.sender != teeAddress) revert NotTEE();
        _;
    }

    modifier marketActive(bytes32 marketId) {
        IMarketFactory factory = IMarketFactory(marketFactory);
        IMarketFactory.Market memory market = factory.getMarket(marketId);
        if (market.resolved) revert MarketAlreadyResolved();
        _;
    }

    modifier marketResolved(bytes32 marketId) {
        IMarketFactory factory = IMarketFactory(marketFactory);
        if (!factory.isMarketResolved(marketId)) revert MarketNotResolved();
        _;
    }

    modifier poolRequired(bytes32 marketId) {
        if (!pools[marketId].initialized) revert PoolNotFound();
        _;
    }

    // ============================================================================
    // Constructor
    // ============================================================================

    /// @notice Initialize the prediction market contract
    /// @param _marketFactory MarketFactory contract address
    /// @param _cUSDC Confidential USDC token address
    /// @param _teeAddress TEE address for state updates
    /// @param _teePublicKey TEE public key for encryption
    constructor(
        address _marketFactory,
        address _cUSDC,
        address _teeAddress,
        bytes memory _teePublicKey
    ) Ownable(msg.sender) {
        marketFactory = _marketFactory;
        cUSDC = _cUSDC;
        teeAddress = _teeAddress;
        teePublicKey = _teePublicKey;
    }

    // ============================================================================
    // User Functions (per SPEC.md)
    // ============================================================================

    /// @inheritdoc IPredictionMarket
    function buy(
        bytes32 marketId,
        bool isYes,
        bytes calldata encryptedAmount
    ) external override whenNotPaused nonReentrant marketActive(marketId) poolRequired(marketId) {
        if (encryptedAmount.length == 0) revert InvalidAmount();

        // Emit event for TEE to process
        // Per SPEC.md: TEE will:
        // 1. Decrypt the amount
        // 2. Check user's cUSDC balance
        // 3. Execute AMM swap (constant product)
        // 4. Update encrypted balances on-chain
        emit BuyRequested(msg.sender, marketId, isYes, encryptedAmount);
    }

    /// @inheritdoc IPredictionMarket
    function sell(
        bytes32 marketId,
        bool isYes,
        bytes calldata encryptedAmount
    ) external override whenNotPaused nonReentrant marketActive(marketId) poolRequired(marketId) {
        if (encryptedAmount.length == 0) revert InvalidAmount();

        // Emit event for TEE to process
        // Per SPEC.md: TEE will:
        // 1. Decrypt the amount
        // 2. Check user's cYES/cNO balance
        // 3. Execute AMM swap (constant product)
        // 4. Update encrypted balances on-chain
        emit SellRequested(msg.sender, marketId, isYes, encryptedAmount);
    }

    /// @inheritdoc IPredictionMarket
    function redeem(bytes32 marketId)
        external
        override
        whenNotPaused
        nonReentrant
        marketResolved(marketId)
    {
        if (hasRedeemed[marketId][msg.sender]) {
            // Already redeemed, just return silently
            return;
        }

        hasRedeemed[marketId][msg.sender] = true;

        // Emit event for TEE to process
        // Per SPEC.md: TEE will:
        // 1. Check winning outcome from MarketFactory
        // 2. Get user's winning token balance (cYES or cNO)
        // 3. Convert 1:1 to cUSDC
        // 4. Update encrypted balances on-chain
        emit RedeemRequested(msg.sender, marketId);
    }

    // ============================================================================
    // TEE Functions
    // ============================================================================

    /// @inheritdoc IPredictionMarket
    function updatePrice(
        bytes32 marketId,
        uint256 priceYes,
        uint256 priceNo
    ) external override onlyTEE {
        PoolState storage pool = pools[marketId];
        if (!pool.initialized) revert PoolNotFound();

        pool.priceYes = priceYes;
        pool.priceNo = priceNo;
        pool.lastUpdate = block.timestamp;

        emit PriceUpdated(marketId, priceYes, priceNo);
    }

    /// @inheritdoc IPredictionMarket
    function initializePool(bytes32 marketId, uint256 initialLiquidity)
        external
        override
        onlyTEE
    {
        // Verify market exists
        IMarketFactory factory = IMarketFactory(marketFactory);
        IMarketFactory.Market memory market = factory.getMarket(marketId);
        if (market.creator == address(0)) revert MarketNotFound();

        if (pools[marketId].initialized) revert PoolAlreadyExists();

        // Initialize with 50/50 probability
        pools[marketId] = PoolState({
            initialized: true,
            priceYes: 5000,  // 50%
            priceNo: 5000,   // 50%
            lastUpdate: block.timestamp,
            initialLiquidity: initialLiquidity
        });

        emit PoolInitialized(marketId, initialLiquidity);
    }

    // ============================================================================
    // View Functions
    // ============================================================================

    /// @inheritdoc IPredictionMarket
    function getIndicativePrice(bytes32 marketId)
        external
        view
        override
        returns (uint256 priceYes, uint256 priceNo, uint256 lastUpdate)
    {
        PoolState storage pool = pools[marketId];
        if (!pool.initialized) revert PoolNotFound();

        return (pool.priceYes, pool.priceNo, pool.lastUpdate);
    }

    /// @inheritdoc IPredictionMarket
    function poolExists(bytes32 marketId) external view override returns (bool exists) {
        return pools[marketId].initialized;
    }

    /// @inheritdoc IPredictionMarket
    function getTEEPublicKey() external view override returns (bytes memory publicKey) {
        return teePublicKey;
    }

    /// @notice Check if user has redeemed for a market
    /// @param marketId Market to check
    /// @param user User address
    /// @return redeemed True if already redeemed
    function hasUserRedeemed(bytes32 marketId, address user) external view returns (bool redeemed) {
        return hasRedeemed[marketId][user];
    }

    /// @notice Get pool initial liquidity
    /// @param marketId Market to query
    /// @return liquidity Initial liquidity amount
    function getPoolLiquidity(bytes32 marketId) external view returns (uint256 liquidity) {
        return pools[marketId].initialLiquidity;
    }

    // ============================================================================
    // Admin Functions
    // ============================================================================

    /// @notice Update TEE address
    /// @param _teeAddress New TEE address
    function setTEEAddress(address _teeAddress) external onlyOwner {
        teeAddress = _teeAddress;
    }

    /// @notice Update TEE public key
    /// @param _teePublicKey New TEE public key
    function setTEEPublicKey(bytes calldata _teePublicKey) external onlyOwner {
        teePublicKey = _teePublicKey;
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
