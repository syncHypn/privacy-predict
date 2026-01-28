/**
 * PMTState unit tests
 *
 * Tests the Patricia Merkle Trie state wrapper, especially
 * lexicographic iteration which is critical for order matching.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PMTState, createPMTState } from '../state/pmtState.js';

describe('PMTState', () => {
  let pmtState: PMTState;

  beforeEach(async () => {
    pmtState = createPMTState();
    await pmtState.initialize();
  });

  describe('basic operations', () => {
    it('should put and get a value', async () => {
      const key = 'test:key';
      const value = new TextEncoder().encode('test-value');

      await pmtState.put(key, value);
      const retrieved = await pmtState.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      const result = await pmtState.get('non-existent');
      expect(result).toBeNull();
    });

    it('should delete a key', async () => {
      const key = 'test:delete';
      await pmtState.put(key, new TextEncoder().encode('value'));

      await pmtState.del(key);
      const result = await pmtState.get(key);

      expect(result).toBeNull();
    });

    it('should check if key exists', async () => {
      const key = 'test:exists';
      await pmtState.put(key, new TextEncoder().encode('value'));

      expect(await pmtState.has(key)).toBe(true);
      expect(await pmtState.has('non-existent')).toBe(false);
    });
  });

  describe('JSON operations', () => {
    it('should put and get JSON values', async () => {
      const key = 'test:json';
      const data = { name: 'test', value: 123, nested: { a: 1 } };

      await pmtState.putJSON(key, data);
      const retrieved = await pmtState.getJSON<typeof data>(key);

      expect(retrieved).toEqual(data);
    });
  });

  describe('lexicographic iteration', () => {
    it('should iterate keys in lexicographic order', async () => {
      // Add keys out of order
      const keys = ['c:3', 'a:1', 'b:2', 'd:4'];
      for (const key of keys) {
        await pmtState.put(key, new TextEncoder().encode(`value-${key}`));
      }

      const collected: string[] = [];
      for await (const entry of pmtState.iterate()) {
        collected.push(entry.key);
      }

      // Should be sorted lexicographically
      expect(collected).toEqual(['a:1', 'b:2', 'c:3', 'd:4']);
    });

    it('should iterate with gte filter', async () => {
      const keys = ['a:1', 'b:2', 'c:3', 'd:4'];
      for (const key of keys) {
        await pmtState.put(key, new TextEncoder().encode(`value-${key}`));
      }

      const collected: string[] = [];
      for await (const entry of pmtState.iterate({ gte: 'b' })) {
        collected.push(entry.key);
      }

      expect(collected).toEqual(['b:2', 'c:3', 'd:4']);
    });

    it('should iterate with lt filter', async () => {
      const keys = ['a:1', 'b:2', 'c:3', 'd:4'];
      for (const key of keys) {
        await pmtState.put(key, new TextEncoder().encode(`value-${key}`));
      }

      const collected: string[] = [];
      for await (const entry of pmtState.iterate({ lt: 'c:' })) {
        collected.push(entry.key);
      }

      expect(collected).toEqual(['a:1', 'b:2']);
    });

    it('should iterate with limit', async () => {
      const keys = ['a:1', 'b:2', 'c:3', 'd:4'];
      for (const key of keys) {
        await pmtState.put(key, new TextEncoder().encode(`value-${key}`));
      }

      const collected: string[] = [];
      for await (const entry of pmtState.iterate({ limit: 2 })) {
        collected.push(entry.key);
      }

      expect(collected).toEqual(['a:1', 'b:2']);
    });
  });

  describe('prefix iteration', () => {
    it('should iterate keys with matching prefix', async () => {
      // Add keys with different prefixes
      await pmtState.put('market:0x1:ask:001', new TextEncoder().encode('v1'));
      await pmtState.put('market:0x1:ask:002', new TextEncoder().encode('v2'));
      await pmtState.put('market:0x1:bid:001', new TextEncoder().encode('v3'));
      await pmtState.put('market:0x2:ask:001', new TextEncoder().encode('v4'));
      await pmtState.put('other:key', new TextEncoder().encode('v5'));

      const collected: string[] = [];
      for await (const entry of pmtState.iteratePrefix('market:0x1:ask:')) {
        collected.push(entry.key);
      }

      expect(collected).toEqual([
        'market:0x1:ask:001',
        'market:0x1:ask:002',
      ]);
    });

    it('should return empty for non-matching prefix', async () => {
      await pmtState.put('market:0x1:ask:001', new TextEncoder().encode('v1'));

      const collected: string[] = [];
      for await (const entry of pmtState.iteratePrefix('nonexistent:')) {
        collected.push(entry.key);
      }

      expect(collected).toEqual([]);
    });
  });

  describe('order key iteration (critical for matching)', () => {
    it('should iterate ASK orders in ascending price order', async () => {
      // ASK orders: lower prices should come first (better for buyer)
      const askOrders = [
        { price: '0050', id: '0x1' }, // 0.50
        { price: '0045', id: '0x2' }, // 0.45 - best
        { price: '0055', id: '0x3' }, // 0.55
        { price: '0045', id: '0x4' }, // 0.45 - same price, different id
      ];

      for (const order of askOrders) {
        const key = `market:0xabc:outcome:0:ask:${order.price}:${order.id}`;
        await pmtState.put(key, new TextEncoder().encode(JSON.stringify(order)));
      }

      const collected: string[] = [];
      for await (const entry of pmtState.iteratePrefix('market:0xabc:outcome:0:ask:')) {
        collected.push(entry.key);
      }

      // Should be sorted by price ascending (0045 < 0050 < 0055)
      // Within same price, sorted by orderId
      expect(collected).toEqual([
        'market:0xabc:outcome:0:ask:0045:0x2',
        'market:0xabc:outcome:0:ask:0045:0x4',
        'market:0xabc:outcome:0:ask:0050:0x1',
        'market:0xabc:outcome:0:ask:0055:0x3',
      ]);
    });

    it('should iterate BID orders in descending price order (via inverted encoding)', async () => {
      // BID orders use inverted encoding: 9999 - price*100
      // So 0.55 -> 9944, 0.50 -> 9949, 0.45 -> 9954
      // Lexicographic sort of inverted = descending original price
      const bidOrders = [
        { encodedPrice: '9949', originalPrice: 0.50, id: '0x1' },
        { encodedPrice: '9944', originalPrice: 0.55, id: '0x2' }, // best (highest)
        { encodedPrice: '9954', originalPrice: 0.45, id: '0x3' },
      ];

      for (const order of bidOrders) {
        const key = `market:0xabc:outcome:0:bid:${order.encodedPrice}:${order.id}`;
        await pmtState.put(key, new TextEncoder().encode(JSON.stringify(order)));
      }

      const collected: string[] = [];
      for await (const entry of pmtState.iteratePrefix('market:0xabc:outcome:0:bid:')) {
        collected.push(entry.key);
      }

      // Lexicographic: 9944 < 9949 < 9954
      // Which corresponds to prices: 0.55 > 0.50 > 0.45 (descending)
      expect(collected).toEqual([
        'market:0xabc:outcome:0:bid:9944:0x2', // 0.55 - best bid
        'market:0xabc:outcome:0:bid:9949:0x1', // 0.50
        'market:0xabc:outcome:0:bid:9954:0x3', // 0.45
      ]);
    });
  });

  describe('snapshots', () => {
    it('should create and restore snapshot', async () => {
      // Add some data
      await pmtState.put('key1', new TextEncoder().encode('value1'));
      await pmtState.put('key2', new TextEncoder().encode('value2'));
      pmtState.incrementVersion();

      // Create snapshot
      const snapshot = await pmtState.createSnapshot();

      // Create new state and restore
      const newState = createPMTState();
      await newState.initialize(snapshot);

      // Verify data
      const v1 = await newState.get('key1');
      const v2 = await newState.get('key2');

      expect(new TextDecoder().decode(v1!)).toBe('value1');
      expect(new TextDecoder().decode(v2!)).toBe('value2');
      expect(newState.getStateVersion()).toBe(1);
    });
  });

  describe('root hash', () => {
    it('should return consistent root for same data', async () => {
      await pmtState.put('key1', new TextEncoder().encode('value1'));
      const root1 = pmtState.getRoot();

      // Create another state with same data
      const state2 = createPMTState();
      await state2.initialize();
      await state2.put('key1', new TextEncoder().encode('value1'));
      const root2 = state2.getRoot();

      expect(root1).toBe(root2);
    });

    it('should return different root for different data', async () => {
      await pmtState.put('key1', new TextEncoder().encode('value1'));
      const root1 = pmtState.getRoot();

      await pmtState.put('key2', new TextEncoder().encode('value2'));
      const root2 = pmtState.getRoot();

      expect(root1).not.toBe(root2);
    });
  });
});
