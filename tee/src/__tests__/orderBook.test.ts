/**
 * OrderBook unit tests
 *
 * Tests the PMT-based order book, especially the critical
 * price-time priority iteration for order matching.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPMTState, type PMTState } from '../state/pmtState.js';
import { createOrderBook, type PMTOrderBook } from '../matching/orderBook.js';
import type { OrderValue } from '../types.js';
import type { Address, Hex } from 'viem';

describe('PMTOrderBook', () => {
  let pmtState: PMTState;
  let orderBook: PMTOrderBook;

  const marketId = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' as Hex;
  const outcomeIndex = 0;

  function createOrder(overrides: Partial<OrderValue> = {}): OrderValue {
    return {
      orderId: ('0x' + Math.random().toString(16).slice(2).padStart(64, '0')) as Hex,
      userId: '0x1111111111111111111111111111111111111111' as Address,
      marketId,
      outcomeIndex,
      side: 'BUY',
      price: 0.50,
      amount: BigInt(100),
      originalAmount: BigInt(100),
      timestamp: Date.now(),
      status: 'OPEN',
      ...overrides,
    };
  }

  beforeEach(async () => {
    pmtState = createPMTState();
    await pmtState.initialize();
    orderBook = createOrderBook(pmtState);
  });

  describe('basic operations', () => {
    it('should add and retrieve an order', async () => {
      const order = createOrder();
      await orderBook.addOrder(order);

      const retrieved = await orderBook.getOrder(order.orderId);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.orderId).toBe(order.orderId);
      expect(retrieved?.price).toBe(order.price);
      expect(retrieved?.amount).toBe(order.amount);
    });

    it('should remove an order', async () => {
      const order = createOrder();
      await orderBook.addOrder(order);

      const removed = await orderBook.removeOrder(order.orderId);
      const retrieved = await orderBook.getOrder(order.orderId);

      expect(removed).not.toBeNull();
      expect(retrieved).toBeNull();
    });

    it('should update an order', async () => {
      const order = createOrder();
      await orderBook.addOrder(order);

      const updated = await orderBook.updateOrder(order.orderId, BigInt(50), 'PARTIAL');

      expect(updated?.amount).toBe(BigInt(50));
      expect(updated?.status).toBe('PARTIAL');
    });
  });

  describe('price-time priority for BID orders', () => {
    it('should iterate BID orders with highest price first', async () => {
      // Add BID orders at different prices (out of order)
      const orders = [
        createOrder({ side: 'BUY', price: 0.50 }),
        createOrder({ side: 'BUY', price: 0.55 }), // best
        createOrder({ side: 'BUY', price: 0.45 }),
        createOrder({ side: 'BUY', price: 0.52 }),
      ];

      for (const order of orders) {
        await orderBook.addOrder(order);
      }

      const collected: number[] = [];
      for await (const order of orderBook.iterateMatchableOrders(marketId, outcomeIndex, 'bid')) {
        collected.push(order.price);
      }

      // BID orders should come in descending price order
      expect(collected).toEqual([0.55, 0.52, 0.50, 0.45]);
    });

    it('should maintain time priority within same price', async () => {
      // Add orders at same price with different timestamps
      const order1 = createOrder({
        orderId: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
        side: 'BUY',
        price: 0.50,
        timestamp: 1000,
      });
      const order2 = createOrder({
        orderId: '0x0000000000000000000000000000000000000000000000000000000000000002' as Hex,
        side: 'BUY',
        price: 0.50,
        timestamp: 2000,
      });

      // Add in reverse order to ensure sorting works
      await orderBook.addOrder(order2);
      await orderBook.addOrder(order1);

      const collected: Hex[] = [];
      for await (const order of orderBook.iterateMatchableOrders(marketId, outcomeIndex, 'bid')) {
        collected.push(order.orderId);
      }

      // Within same price, should be sorted by orderId (proxy for time)
      expect(collected).toEqual([order1.orderId, order2.orderId]);
    });
  });

  describe('price-time priority for ASK orders', () => {
    it('should iterate ASK orders with lowest price first', async () => {
      // Add ASK orders at different prices (out of order)
      const orders = [
        createOrder({ side: 'SELL', price: 0.50 }),
        createOrder({ side: 'SELL', price: 0.45 }), // best
        createOrder({ side: 'SELL', price: 0.55 }),
        createOrder({ side: 'SELL', price: 0.48 }),
      ];

      for (const order of orders) {
        await orderBook.addOrder(order);
      }

      const collected: number[] = [];
      for await (const order of orderBook.iterateMatchableOrders(marketId, outcomeIndex, 'ask')) {
        collected.push(order.price);
      }

      // ASK orders should come in ascending price order
      expect(collected).toEqual([0.45, 0.48, 0.50, 0.55]);
    });
  });

  describe('spread calculation', () => {
    it('should calculate correct spread', async () => {
      // Add some BID and ASK orders
      await orderBook.addOrder(createOrder({ side: 'BUY', price: 0.45 }));
      await orderBook.addOrder(createOrder({ side: 'BUY', price: 0.48 })); // best bid
      await orderBook.addOrder(createOrder({ side: 'SELL', price: 0.52 })); // best ask
      await orderBook.addOrder(createOrder({ side: 'SELL', price: 0.55 }));

      const spread = await orderBook.getSpread(marketId, outcomeIndex);

      expect(spread.bestBid).toBe(0.48);
      expect(spread.bestAsk).toBe(0.52);
    });

    it('should return null for empty sides', async () => {
      const spread = await orderBook.getSpread(marketId, outcomeIndex);

      expect(spread.bestBid).toBeNull();
      expect(spread.bestAsk).toBeNull();
    });
  });

  describe('order filtering', () => {
    it('should only iterate OPEN and PARTIAL orders', async () => {
      const openOrder = createOrder({ side: 'BUY', price: 0.50, status: 'OPEN' });
      const partialOrder = createOrder({ side: 'BUY', price: 0.51, status: 'PARTIAL' });
      const filledOrder = createOrder({ side: 'BUY', price: 0.52, status: 'FILLED' });
      const cancelledOrder = createOrder({ side: 'BUY', price: 0.53, status: 'CANCELLED' });

      await orderBook.addOrder(openOrder);
      await orderBook.addOrder(partialOrder);
      await orderBook.addOrder(filledOrder);
      await orderBook.addOrder(cancelledOrder);

      const collected: string[] = [];
      for await (const order of orderBook.iterateMatchableOrders(marketId, outcomeIndex, 'bid')) {
        collected.push(order.status);
      }

      // Should only get OPEN and PARTIAL orders
      expect(collected).toHaveLength(2);
      expect(collected).toContain('OPEN');
      expect(collected).toContain('PARTIAL');
      expect(collected).not.toContain('FILLED');
      expect(collected).not.toContain('CANCELLED');
    });
  });

  describe('multi-market/outcome isolation', () => {
    it('should isolate orders by market', async () => {
      const market1 = '0x1111111111111111111111111111111111111111111111111111111111111111' as Hex;
      const market2 = '0x2222222222222222222222222222222222222222222222222222222222222222' as Hex;

      await orderBook.addOrder(createOrder({ marketId: market1, side: 'BUY', price: 0.50 }));
      await orderBook.addOrder(createOrder({ marketId: market2, side: 'BUY', price: 0.55 }));

      const market1Orders: OrderValue[] = [];
      for await (const order of orderBook.iterateMatchableOrders(market1, outcomeIndex, 'bid')) {
        market1Orders.push(order);
      }

      expect(market1Orders).toHaveLength(1);
      expect(market1Orders[0]?.marketId).toBe(market1);
    });

    it('should isolate orders by outcome', async () => {
      await orderBook.addOrder(createOrder({ outcomeIndex: 0, side: 'BUY', price: 0.50 }));
      await orderBook.addOrder(createOrder({ outcomeIndex: 1, side: 'BUY', price: 0.55 }));

      const outcome0Orders: OrderValue[] = [];
      for await (const order of orderBook.iterateMatchableOrders(marketId, 0, 'bid')) {
        outcome0Orders.push(order);
      }

      expect(outcome0Orders).toHaveLength(1);
      expect(outcome0Orders[0]?.outcomeIndex).toBe(0);
    });
  });

  describe('order counting', () => {
    it('should count orders correctly', async () => {
      await orderBook.addOrder(createOrder({ side: 'BUY', price: 0.50 }));
      await orderBook.addOrder(createOrder({ side: 'BUY', price: 0.51 }));
      await orderBook.addOrder(createOrder({ side: 'SELL', price: 0.55 }));

      const bidCount = await orderBook.countOrders(marketId, outcomeIndex, 'bid');
      const askCount = await orderBook.countOrders(marketId, outcomeIndex, 'ask');

      expect(bidCount).toBe(2);
      expect(askCount).toBe(1);
    });
  });
});
