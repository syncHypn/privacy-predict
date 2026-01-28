// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMarketFactory {
    struct Market {
        bytes32 marketId;
        string question;
        string[] outcomes;
        uint256 resolutionTime;
        uint8 winningOutcome;
        bool resolved;
        address creator;
    }

    event MarketCreated(
        bytes32 indexed marketId,
        string question,
        string[] outcomes,
        uint256 resolutionTime,
        address indexed creator
    );

    event MarketResolved(bytes32 indexed marketId, uint8 winningOutcome);

    error MarketAlreadyExists();
    error MarketNotFound();
    error MarketAlreadyResolved();
    error MarketNotExpired();
    error InvalidOutcome();
    error TooManyOutcomes();
    error TooFewOutcomes();
    error InvalidResolutionTime();
    error NotOracle();
    error NotWhitelisted();

    function createMarket(
        string calldata question,
        string[] calldata outcomes,
        uint256 resolutionTime
    ) external returns (bytes32 marketId);

    function resolveMarket(bytes32 marketId, uint8 winningOutcome) external;

    function getMarket(bytes32 marketId) external view returns (Market memory);

    function getOutcomes(bytes32 marketId) external view returns (string[] memory);

    function isMarketResolved(bytes32 marketId) external view returns (bool);

    function getWinningOutcome(bytes32 marketId) external view returns (uint8);

    function marketExists(bytes32 marketId) external view returns (bool);
}
