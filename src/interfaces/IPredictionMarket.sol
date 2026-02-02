// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPredictionMarket
/// @notice Interface for the confidential prediction market AMM
/// @dev Per SPEC.md: Handles buy/sell of cYES/cNO tokens via AMM
interface IPredictionMarket {
    // ============================================================================
    // Events (per SPEC.md)
    // ============================================================================

    /// @notice Emitted when user wants to buy cYES or cNO with cUSDC
    /// @param user User address
    /// @param marketId Market identifier
    /// @param isYes True for cYES, false for cNO
    /// @param encryptedAmount Encrypted cUSDC amount (decrypted by TEE)
    event BuyRequested(
        address indexed user,
        bytes32 indexed marketId,
        bool isYes,
        bytes encryptedAmount
    );

    /// @notice Emitted when user wants to sell cYES or cNO for cUSDC
    /// @param user User address
    /// @param marketId Market identifier
    /// @param isYes True for cYES, false for cNO
    /// @param encryptedAmount Encrypted token amount (decrypted by TEE)
    event SellRequested(
        address indexed user,
        bytes32 indexed marketId,
        bool isYes,
        bytes encryptedAmount
    );

    /// @notice Emitted when user wants to redeem winning tokens after resolution
    /// @param user User address
    /// @param marketId Market identifier
    event RedeemRequested(address indexed user, bytes32 indexed marketId);

    /// @notice Emitted when TEE updates pool state
    /// @param marketId Market identifier
    /// @param priceYes New YES price (scaled by 1e4 for precision)
    /// @param priceNo New NO price (scaled by 1e4 for precision)
    event PriceUpdated(
        bytes32 indexed marketId,
        uint256 priceYes,
        uint256 priceNo
    );

    /// @notice Emitted when a new AMM pool is initialized
    /// @param marketId Market identifier
    /// @param initialLiquidity Initial cUSDC liquidity
    event PoolInitialized(bytes32 indexed marketId, uint256 initialLiquidity);

    // ============================================================================
    // Errors
    // ============================================================================

    error MarketNotFound();
    error MarketNotActive();
    error MarketNotResolved();
    error MarketAlreadyResolved();
    error PoolAlreadyExists();
    error PoolNotFound();
    error InvalidAmount();
    error NotTEE();
    error NotMarketFactory();

    // ============================================================================
    // User Functions (per SPEC.md)
    // ============================================================================

    /// @notice Buy cYES or cNO tokens with cUSDC via AMM
    /// @dev TEE monitors event and processes swap
    /// @param marketId Market to trade in
    /// @param isYes True to buy cYES, false to buy cNO
    /// @param encryptedAmount Encrypted cUSDC amount (encrypted with TEE public key)
    function buy(
        bytes32 marketId,
        bool isYes,
        bytes calldata encryptedAmount
    ) external;

    /// @notice Sell cYES or cNO tokens for cUSDC via AMM
    /// @dev TEE monitors event and processes swap
    /// @param marketId Market to trade in
    /// @param isYes True to sell cYES, false to sell cNO
    /// @param encryptedAmount Encrypted token amount (encrypted with TEE public key)
    function sell(
        bytes32 marketId,
        bool isYes,
        bytes calldata encryptedAmount
    ) external;

    /// @notice Redeem winning tokens after market resolution
    /// @dev TEE monitors event and processes redemption (cYES or cNO -> cUSDC at 1:1 rate)
    /// @param marketId Resolved market to redeem from
    function redeem(bytes32 marketId) external;

    // ============================================================================
    // TEE Functions
    // ============================================================================

    /// @notice Update indicative price (called by TEE after swaps)
    /// @param marketId Market identifier
    /// @param priceYes New YES probability (scaled by 1e4)
    /// @param priceNo New NO probability (scaled by 1e4)
    function updatePrice(
        bytes32 marketId,
        uint256 priceYes,
        uint256 priceNo
    ) external;

    /// @notice Initialize AMM pool for a market
    /// @dev TEE will set up initial liquidity
    /// @param marketId Market identifier
    /// @param initialLiquidity Initial cUSDC liquidity for the pool
    function initializePool(bytes32 marketId, uint256 initialLiquidity) external;

    // ============================================================================
    // View Functions
    // ============================================================================

    /// @notice Get current indicative prices for a market
    /// @dev Per SPEC.md: Only prices are public, volumes remain confidential
    /// @param marketId Market to query
    /// @return priceYes YES probability (scaled by 1e4, e.g., 5000 = 50%)
    /// @return priceNo NO probability (scaled by 1e4)
    /// @return lastUpdate Timestamp of last price update
    function getIndicativePrice(bytes32 marketId)
        external
        view
        returns (uint256 priceYes, uint256 priceNo, uint256 lastUpdate);

    /// @notice Check if a pool exists for a market
    /// @param marketId Market to check
    /// @return exists True if pool is initialized
    function poolExists(bytes32 marketId) external view returns (bool exists);

    /// @notice Get the TEE public key for order encryption
    /// @return publicKey TEE's X25519 public key
    function getTEEPublicKey() external view returns (bytes memory publicKey);

    /// @notice Get the market factory address
    /// @return factory MarketFactory contract address
    function marketFactory() external view returns (address factory);

    /// @notice Get the cUSDC token address
    /// @return token ConfidentialERC20 cUSDC address
    function cUSDC() external view returns (address token);
}
