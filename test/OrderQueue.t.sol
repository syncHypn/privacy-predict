// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test, console } from "forge-std/Test.sol";
import { OrderQueue } from "../src/OrderQueue.sol";
import { MarketFactory } from "../src/MarketFactory.sol";
import { IOrderQueue } from "../src/interfaces/IOrderQueue.sol";

contract OrderQueueTest is Test {
    OrderQueue public orderQueue;
    MarketFactory public factory;

    address public owner = address(this);
    address public oracle = makeAddr("oracle");
    address public creator = makeAddr("creator");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");

    bytes32 public marketId;
    bytes public encryptedPayload = hex"deadbeef1234567890";

    event OrderSubmitted(
        bytes32 indexed orderId,
        bytes32 indexed marketId,
        address indexed user,
        bytes encryptedPayload,
        uint256 timestamp
    );

    event OrderCancelled(bytes32 indexed orderId, address indexed user);

    function setUp() public {
        factory = new MarketFactory(oracle);
        orderQueue = new OrderQueue(address(factory));

        // Create a market
        factory.addToWhitelist(creator);

        string[] memory outcomes = new string[](2);
        outcomes[0] = "Yes";
        outcomes[1] = "No";

        vm.prank(creator);
        marketId = factory.createMarket("Test question?", outcomes, block.timestamp + 1 days);
    }

    // ============ Order Submission Tests ============

    function test_SubmitOrder() public {
        vm.prank(user1);
        bytes32 orderId = orderQueue.submitOrder(marketId, encryptedPayload);

        assertTrue(orderId != bytes32(0));

        IOrderQueue.EncryptedOrder memory order = orderQueue.getOrder(orderId);
        assertEq(order.marketId, marketId);
        assertEq(order.user, user1);
        assertEq(order.encryptedPayload, encryptedPayload);
    }

    function test_SubmitOrder_EmitsEvent() public {
        vm.prank(user1);
        vm.expectEmit(false, true, true, true);
        emit OrderSubmitted(bytes32(0), marketId, user1, encryptedPayload, block.timestamp);
        orderQueue.submitOrder(marketId, encryptedPayload);
    }

    function test_SubmitOrder_MultipleOrders() public {
        vm.startPrank(user1);
        bytes32 orderId1 = orderQueue.submitOrder(marketId, encryptedPayload);
        bytes32 orderId2 = orderQueue.submitOrder(marketId, hex"abcd");
        vm.stopPrank();

        assertTrue(orderId1 != orderId2);

        bytes32[] memory userOrders = orderQueue.getUserOrders(user1);
        assertEq(userOrders.length, 2);
        assertEq(userOrders[0], orderId1);
        assertEq(userOrders[1], orderId2);
    }

    function test_SubmitOrder_RevertWhen_InvalidMarket() public {
        vm.prank(user1);
        vm.expectRevert(IOrderQueue.InvalidMarket.selector);
        orderQueue.submitOrder(bytes32(uint256(999)), encryptedPayload);
    }

    function test_SubmitOrder_RevertWhen_MarketResolved() public {
        // Fast forward and resolve market
        vm.warp(block.timestamp + 2 days);
        vm.prank(oracle);
        factory.resolveMarket(marketId, 0);

        vm.prank(user1);
        vm.expectRevert(IOrderQueue.MarketClosed.selector);
        orderQueue.submitOrder(marketId, encryptedPayload);
    }

    function test_SubmitOrder_RevertWhen_EmptyPayload() public {
        vm.prank(user1);
        vm.expectRevert(IOrderQueue.EmptyPayload.selector);
        orderQueue.submitOrder(marketId, "");
    }

    function test_SubmitOrder_RevertWhen_Paused() public {
        orderQueue.pause();

        vm.prank(user1);
        vm.expectRevert();
        orderQueue.submitOrder(marketId, encryptedPayload);
    }

    // ============ Order Cancellation Tests ============

    function test_CancelOrder() public {
        vm.prank(user1);
        bytes32 orderId = orderQueue.submitOrder(marketId, encryptedPayload);

        vm.prank(user1);
        orderQueue.cancelOrder(orderId);

        assertTrue(orderQueue.isOrderCancelled(orderId));
    }

    function test_CancelOrder_EmitsEvent() public {
        vm.prank(user1);
        bytes32 orderId = orderQueue.submitOrder(marketId, encryptedPayload);

        vm.prank(user1);
        vm.expectEmit(true, true, false, false);
        emit OrderCancelled(orderId, user1);
        orderQueue.cancelOrder(orderId);
    }

    function test_CancelOrder_RevertWhen_NotOwner() public {
        vm.prank(user1);
        bytes32 orderId = orderQueue.submitOrder(marketId, encryptedPayload);

        vm.prank(user2);
        vm.expectRevert(IOrderQueue.NotOrderOwner.selector);
        orderQueue.cancelOrder(orderId);
    }

    function test_CancelOrder_RevertWhen_OrderNotFound() public {
        vm.prank(user1);
        vm.expectRevert(IOrderQueue.OrderNotFound.selector);
        orderQueue.cancelOrder(bytes32(uint256(999)));
    }

    function test_CancelOrder_RevertWhen_AlreadyCancelled() public {
        vm.prank(user1);
        bytes32 orderId = orderQueue.submitOrder(marketId, encryptedPayload);

        vm.prank(user1);
        orderQueue.cancelOrder(orderId);

        vm.prank(user1);
        vm.expectRevert(IOrderQueue.OrderNotFound.selector);
        orderQueue.cancelOrder(orderId);
    }

    // ============ View Function Tests ============

    function test_GetUserOrders() public {
        vm.startPrank(user1);
        bytes32 orderId1 = orderQueue.submitOrder(marketId, encryptedPayload);
        bytes32 orderId2 = orderQueue.submitOrder(marketId, hex"1234");
        vm.stopPrank();

        bytes32[] memory orders = orderQueue.getUserOrders(user1);
        assertEq(orders.length, 2);
        assertEq(orders[0], orderId1);
        assertEq(orders[1], orderId2);
    }

    function test_GetMarketOrders() public {
        vm.prank(user1);
        bytes32 orderId1 = orderQueue.submitOrder(marketId, encryptedPayload);

        vm.prank(user2);
        bytes32 orderId2 = orderQueue.submitOrder(marketId, hex"5678");

        bytes32[] memory orders = orderQueue.getMarketOrders(marketId);
        assertEq(orders.length, 2);
        assertEq(orders[0], orderId1);
        assertEq(orders[1], orderId2);
    }

    function test_GetUserOrderCount() public {
        assertEq(orderQueue.getUserOrderCount(user1), 0);

        vm.prank(user1);
        orderQueue.submitOrder(marketId, encryptedPayload);

        assertEq(orderQueue.getUserOrderCount(user1), 1);
    }

    function test_GetMarketOrderCount() public {
        assertEq(orderQueue.getMarketOrderCount(marketId), 0);

        vm.prank(user1);
        orderQueue.submitOrder(marketId, encryptedPayload);

        assertEq(orderQueue.getMarketOrderCount(marketId), 1);
    }

    // ============ Admin Function Tests ============

    function test_Pause_Unpause() public {
        orderQueue.pause();
        assertTrue(orderQueue.paused());

        orderQueue.unpause();
        assertFalse(orderQueue.paused());
    }

    function test_Pause_RevertWhen_NotOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        orderQueue.pause();
    }
}
