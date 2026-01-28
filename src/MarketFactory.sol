// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IMarketFactory } from "./interfaces/IMarketFactory.sol";

/// @title MarketFactory
/// @notice Creates and manages prediction markets for iPred protocol
/// @dev Markets support 2-10 categorical outcomes resolved by oracle
contract MarketFactory is IMarketFactory, Ownable, Pausable, ReentrancyGuard {
    uint8 public constant MIN_OUTCOMES = 2;
    uint8 public constant MAX_OUTCOMES = 10;
    uint8 public constant UNRESOLVED = 255;

    address public oracle;
    mapping(address => bool) public whitelisted;
    mapping(bytes32 => Market) private markets;
    mapping(bytes32 => string[]) private marketOutcomes;
    bytes32[] public marketIds;

    uint256 private nonce;

    modifier onlyOracle() {
        if (msg.sender != oracle) revert NotOracle();
        _;
    }

    modifier onlyWhitelisted() {
        if (!whitelisted[msg.sender] && msg.sender != owner()) revert NotWhitelisted();
        _;
    }

    constructor(address _oracle) Ownable(msg.sender) {
        oracle = _oracle;
    }

    /// @notice Creates a new prediction market
    /// @param question The market question (e.g., "Who will win the match?")
    /// @param outcomes Array of possible outcomes (e.g., ["Team A", "Team B", "Draw"])
    /// @param resolutionTime Unix timestamp when market can be resolved
    /// @return marketId Unique identifier for the market
    function createMarket(
        string calldata question,
        string[] calldata outcomes,
        uint256 resolutionTime
    ) external onlyWhitelisted whenNotPaused nonReentrant returns (bytes32 marketId) {
        if (outcomes.length < MIN_OUTCOMES) revert TooFewOutcomes();
        if (outcomes.length > MAX_OUTCOMES) revert TooManyOutcomes();
        if (resolutionTime <= block.timestamp) revert InvalidResolutionTime();

        marketId = keccak256(abi.encodePacked(question, block.timestamp, msg.sender, nonce++));

        if (markets[marketId].creator != address(0)) revert MarketAlreadyExists();

        markets[marketId] = Market({
            marketId: marketId,
            question: question,
            outcomes: new string[](0), // Store separately due to dynamic array
            resolutionTime: resolutionTime,
            winningOutcome: UNRESOLVED,
            resolved: false,
            creator: msg.sender
        });

        // Store outcomes separately
        for (uint256 i = 0; i < outcomes.length; i++) {
            marketOutcomes[marketId].push(outcomes[i]);
        }

        marketIds.push(marketId);

        emit MarketCreated(marketId, question, outcomes, resolutionTime, msg.sender);
    }

    /// @notice Resolves a market with the winning outcome
    /// @param marketId The market to resolve
    /// @param winningOutcome Index of the winning outcome
    function resolveMarket(bytes32 marketId, uint8 winningOutcome) external onlyOracle whenNotPaused {
        Market storage market = markets[marketId];

        if (market.creator == address(0)) revert MarketNotFound();
        if (market.resolved) revert MarketAlreadyResolved();
        if (block.timestamp < market.resolutionTime) revert MarketNotExpired();
        if (winningOutcome >= marketOutcomes[marketId].length) revert InvalidOutcome();

        market.winningOutcome = winningOutcome;
        market.resolved = true;

        emit MarketResolved(marketId, winningOutcome);
    }

    /// @notice Gets market information
    /// @param marketId The market to query
    /// @return market The market struct
    function getMarket(bytes32 marketId) external view returns (Market memory market) {
        market = markets[marketId];
        if (market.creator == address(0)) revert MarketNotFound();
        market.outcomes = marketOutcomes[marketId];
    }

    /// @notice Gets the outcomes for a market
    /// @param marketId The market to query
    /// @return outcomes Array of outcome strings
    function getOutcomes(bytes32 marketId) external view returns (string[] memory outcomes) {
        if (markets[marketId].creator == address(0)) revert MarketNotFound();
        return marketOutcomes[marketId];
    }

    /// @notice Checks if a market is resolved
    /// @param marketId The market to check
    /// @return True if resolved
    function isMarketResolved(bytes32 marketId) external view returns (bool) {
        return markets[marketId].resolved;
    }

    /// @notice Gets the winning outcome of a resolved market
    /// @param marketId The market to query
    /// @return The winning outcome index
    function getWinningOutcome(bytes32 marketId) external view returns (uint8) {
        Market storage market = markets[marketId];
        if (market.creator == address(0)) revert MarketNotFound();
        if (!market.resolved) revert MarketNotExpired();
        return market.winningOutcome;
    }

    /// @notice Gets the total number of markets created
    /// @return count The number of markets
    function getMarketCount() external view returns (uint256 count) {
        return marketIds.length;
    }

    /// @notice Gets market ID at a specific index
    /// @param index The index in the marketIds array
    /// @return marketId The market ID
    function getMarketIdAt(uint256 index) external view returns (bytes32 marketId) {
        return marketIds[index];
    }

    /// @notice Checks if a market exists
    /// @param marketId The market to check
    /// @return exists True if the market exists
    function marketExists(bytes32 marketId) external view returns (bool exists) {
        return markets[marketId].creator != address(0);
    }

    // Admin functions

    /// @notice Sets the oracle address
    /// @param _oracle New oracle address
    function setOracle(address _oracle) external onlyOwner {
        oracle = _oracle;
    }

    /// @notice Adds an address to the whitelist
    /// @param account Address to whitelist
    function addToWhitelist(address account) external onlyOwner {
        whitelisted[account] = true;
    }

    /// @notice Removes an address from the whitelist
    /// @param account Address to remove
    function removeFromWhitelist(address account) external onlyOwner {
        whitelisted[account] = false;
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
