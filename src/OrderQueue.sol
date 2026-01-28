// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IOrderQueue } from "./interfaces/IOrderQueue.sol";
import { IMarketFactory } from "./interfaces/IMarketFactory.sol";

/// @title OrderQueue
/// @notice Manages encrypted order submissions for iPred protocol
/// @dev Orders are encrypted with TEE public key, only decrypted inside enclave
contract OrderQueue is IOrderQueue, Ownable, Pausable, ReentrancyGuard {
    IMarketFactory public immutable marketFactory;

    mapping(bytes32 => EncryptedOrder) private orders;
    mapping(address => bytes32[]) private userOrders;
    mapping(bytes32 => bytes32[]) private marketOrders;
    mapping(bytes32 => bool) private cancelledOrders;

    uint256 private nonce;

    constructor(address _marketFactory) Ownable(msg.sender) {
        marketFactory = IMarketFactory(_marketFactory);
    }

    /// @notice Submits an encrypted order to the queue
    /// @param marketId The market to place the order on
    /// @param encryptedPayload Order details encrypted with TEE public key
    /// @return orderId Unique identifier for the order
    function submitOrder(
        bytes32 marketId,
        bytes calldata encryptedPayload
    ) external whenNotPaused nonReentrant returns (bytes32 orderId) {
        if (!marketFactory.marketExists(marketId)) revert InvalidMarket();
        if (marketFactory.isMarketResolved(marketId)) revert MarketClosed();
        if (encryptedPayload.length == 0) revert EmptyPayload();

        orderId = keccak256(abi.encodePacked(msg.sender, marketId, block.timestamp, nonce++));

        orders[orderId] = EncryptedOrder({
            orderId: orderId,
            marketId: marketId,
            user: msg.sender,
            encryptedPayload: encryptedPayload,
            timestamp: block.timestamp
        });

        userOrders[msg.sender].push(orderId);
        marketOrders[marketId].push(orderId);

        emit OrderSubmitted(orderId, marketId, msg.sender, encryptedPayload, block.timestamp);
    }

    /// @notice Cancels an open order
    /// @param orderId The order to cancel
    function cancelOrder(bytes32 orderId) external whenNotPaused nonReentrant {
        EncryptedOrder storage order = orders[orderId];

        if (order.user == address(0)) revert OrderNotFound();
        if (order.user != msg.sender) revert NotOrderOwner();
        if (cancelledOrders[orderId]) revert OrderNotFound();

        cancelledOrders[orderId] = true;

        emit OrderCancelled(orderId, msg.sender);
    }

    /// @notice Gets order details
    /// @param orderId The order to query
    /// @return order The encrypted order struct
    function getOrder(bytes32 orderId) external view returns (EncryptedOrder memory order) {
        order = orders[orderId];
        if (order.user == address(0)) revert OrderNotFound();
    }

    /// @notice Gets all order IDs for a user
    /// @param user The user address
    /// @return orderIds Array of order IDs
    function getUserOrders(address user) external view returns (bytes32[] memory orderIds) {
        return userOrders[user];
    }

    /// @notice Gets all order IDs for a market
    /// @param marketId The market to query
    /// @return orderIds Array of order IDs
    function getMarketOrders(bytes32 marketId) external view returns (bytes32[] memory orderIds) {
        return marketOrders[marketId];
    }

    /// @notice Checks if an order is cancelled
    /// @param orderId The order to check
    /// @return True if cancelled
    function isOrderCancelled(bytes32 orderId) external view returns (bool) {
        return cancelledOrders[orderId];
    }

    /// @notice Gets the count of orders for a user
    /// @param user The user address
    /// @return count Number of orders
    function getUserOrderCount(address user) external view returns (uint256 count) {
        return userOrders[user].length;
    }

    /// @notice Gets the count of orders for a market
    /// @param marketId The market to query
    /// @return count Number of orders
    function getMarketOrderCount(bytes32 marketId) external view returns (uint256 count) {
        return marketOrders[marketId].length;
    }

    // Admin functions

    /// @notice Pauses the contract
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Unpauses the contract
    function unpause() external onlyOwner {
        _unpause();
    }
}
