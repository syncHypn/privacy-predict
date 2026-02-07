// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IOrderQueue {
    struct EncryptedOrder {
        bytes32 orderId;
        bytes32 marketId;
        address user;
        bytes encryptedPayload;
        uint256 timestamp;
    }

    event OrderSubmitted(
        bytes32 indexed orderId,
        bytes32 indexed marketId,
        address indexed user,
        bytes encryptedPayload,
        uint256 timestamp
    );

    event OrderCancelled(bytes32 indexed orderId, address indexed user);

    error OrderNotFound();
    error NotOrderOwner();
    error InvalidMarket();
    error MarketClosed();
    error EmptyPayload();
    error InvalidSignature();

    function submitOrder(bytes32 marketId, bytes calldata encryptedPayload) external returns (bytes32 orderId);

    function cancelOrder(bytes32 orderId) external;

    function getOrder(bytes32 orderId) external view returns (EncryptedOrder memory);

    function getUserOrders(address user) external view returns (bytes32[] memory);

    function getMarketOrders(bytes32 marketId) external view returns (bytes32[] memory);
}
