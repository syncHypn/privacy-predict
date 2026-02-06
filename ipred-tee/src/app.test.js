/**
 * Tests for iPred TEE components
 * Run with: node --test src/app.test.js
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';

import {
  hexToBytes,
  bytesToHex,
  generateSealedKey,
  encryptBalance,
  decryptBalance,
  encryptState,
  decryptState,
} from './encryption.js';
import { StateManager } from './stateManager.js';
import { ConfidentialAMM } from './amm.js';

describe('Encryption', () => {
  test('hexToBytes and bytesToHex roundtrip', () => {
    const original = '0x1234567890abcdef';
    const bytes = hexToBytes(original);
    const hex = bytesToHex(bytes);
    assert.strictEqual(hex, original);
  });

  test('generateSealedKey creates 32-byte key', () => {
    const key = generateSealedKey();
    assert.strictEqual(key.length, 32);
  });

  test('encryptBalance and decryptBalance roundtrip', () => {
    const key = generateSealedKey();
    const value = 1000000n;

    const encrypted = encryptBalance(value, key);
    assert.ok(encrypted.nonce);
    assert.ok(encrypted.ciphertext);

    const decrypted = decryptBalance(encrypted, key);
    assert.strictEqual(decrypted, value);
  });

  test('encryptState and decryptState roundtrip', () => {
    const key = generateSealedKey();
    const state = {
      balances: { 'user1:cUSDC': 1000n },
      version: 1,
    };

    const encrypted = encryptState(state, key);
    assert.ok(typeof encrypted === 'string');

    const decrypted = decryptState(encrypted, key);
    assert.deepStrictEqual(decrypted, JSON.parse(JSON.stringify(state, (_, v) =>
      typeof v === 'bigint' ? v.toString() : v
    )));
  });
});

describe('StateManager', () => {
  let stateManager;
  let sealedKey;

  beforeEach(() => {
    sealedKey = generateSealedKey();
    stateManager = new StateManager(sealedKey);
  });

  test('initializePool creates pool with correct reserves', () => {
    const marketId = '0xtest123';
    const liquidity = 1000000n;

    stateManager.initializePool(marketId, liquidity);
    const pool = stateManager.getPool(marketId);

    assert.strictEqual(pool.usdc, liquidity);
    assert.strictEqual(pool.yes, liquidity);
    assert.strictEqual(pool.no, liquidity);
  });

  test('getBalance returns 0 for unknown user', () => {
    const balance = stateManager.getBalance('0xuser', 'cUSDC');
    assert.strictEqual(balance, 0n);
  });

  test('setBalance and getBalance work correctly', () => {
    stateManager.setBalance('0xuser', 'cUSDC', 500n);
    assert.strictEqual(stateManager.getBalance('0xuser', 'cUSDC'), 500n);
  });

  test('addBalance increases balance', () => {
    stateManager.setBalance('0xuser', 'cUSDC', 500n);
    stateManager.addBalance('0xuser', 'cUSDC', 300n);
    assert.strictEqual(stateManager.getBalance('0xuser', 'cUSDC'), 800n);
  });

  test('subtractBalance decreases balance', () => {
    stateManager.setBalance('0xuser', 'cUSDC', 500n);
    stateManager.subtractBalance('0xuser', 'cUSDC', 200n);
    assert.strictEqual(stateManager.getBalance('0xuser', 'cUSDC'), 300n);
  });

  test('subtractBalance throws on insufficient balance', () => {
    stateManager.setBalance('0xuser', 'cUSDC', 100n);
    assert.throws(() => {
      stateManager.subtractBalance('0xuser', 'cUSDC', 200n);
    }, /INSUFFICIENT_BALANCE/);
  });

  test('getIndicativePrices returns 50/50 for equal reserves', () => {
    stateManager.initializePool('0xmarket', 1000n);
    const prices = stateManager.getIndicativePrices('0xmarket');

    assert.ok(Math.abs(prices.yes - 0.5) < 0.001);
    assert.ok(Math.abs(prices.no - 0.5) < 0.001);
  });

  test('exportPublicState exports pool data', () => {
    stateManager.initializePool('0xmarket', 1000n);
    const publicState = stateManager.exportPublicState();

    assert.ok(publicState.pools['0xmarket']);
    assert.strictEqual(publicState.pools['0xmarket'].usdc, '1000');
  });

  test('markOrderProcessed and isOrderProcessed work', () => {
    assert.strictEqual(stateManager.isOrderProcessed('order1'), false);
    stateManager.markOrderProcessed('order1');
    assert.strictEqual(stateManager.isOrderProcessed('order1'), true);
  });
});

describe('ConfidentialAMM', () => {
  let stateManager;
  let amm;
  const marketId = '0xmarket123';
  const user = '0xuser1';

  beforeEach(() => {
    const sealedKey = generateSealedKey();
    stateManager = new StateManager(sealedKey);
    amm = new ConfidentialAMM(stateManager);

    // Initialize pool with 1000 units
    stateManager.initializePool(marketId, 1000000n);

    // Give user some cUSDC
    stateManager.setBalance(user, 'cUSDC', 500000n);
  });

  test('buyYes swaps cUSDC for cYES', () => {
    const result = amm.buyYes(marketId, user, 100000n);

    assert.ok(result.amountOut > 0n);
    assert.ok(result.fee > 0n);

    // User should have less cUSDC
    assert.strictEqual(stateManager.getBalance(user, 'cUSDC'), 400000n);

    // User should have cYES
    assert.strictEqual(stateManager.getBalance(user, `cYES:${marketId}`), result.amountOut);
  });

  test('buyNo swaps cUSDC for cNO', () => {
    const result = amm.buyNo(marketId, user, 100000n);

    assert.ok(result.amountOut > 0n);
    assert.strictEqual(stateManager.getBalance(user, `cNO:${marketId}`), result.amountOut);
  });

  test('sellYes swaps cYES for cUSDC', () => {
    // First buy some cYES
    const buyResult = amm.buyYes(marketId, user, 100000n);
    const yesBalance = stateManager.getBalance(user, `cYES:${marketId}`);

    // Now sell half
    const sellAmount = yesBalance / 2n;
    const sellResult = amm.sellYes(marketId, user, sellAmount);

    assert.ok(sellResult.amountOut > 0n);
    assert.strictEqual(
      stateManager.getBalance(user, `cYES:${marketId}`),
      yesBalance - sellAmount
    );
  });

  test('buyYes throws on insufficient balance', () => {
    assert.throws(() => {
      amm.buyYes(marketId, user, 1000000n); // More than user has
    }, /INSUFFICIENT_BALANCE/);
  });

  test('prices change after trades', () => {
    const pricesBefore = amm.getIndicativePrices(marketId);

    // Buy a significant amount of YES
    amm.buyYes(marketId, user, 200000n);

    const pricesAfter = amm.getIndicativePrices(marketId);

    // YES price should increase after buying YES
    assert.ok(pricesAfter.yes > pricesBefore.yes);
    // NO price should decrease
    assert.ok(pricesAfter.no < pricesBefore.no);
  });

  test('settlePosition pays out winning tokens', () => {
    // Buy some YES
    amm.buyYes(marketId, user, 100000n);
    const yesBalance = stateManager.getBalance(user, `cYES:${marketId}`);
    const usdcBefore = stateManager.getBalance(user, 'cUSDC');

    // Settle with YES winning
    const result = amm.settlePosition(marketId, user, true);

    assert.strictEqual(result.payout, yesBalance);
    assert.strictEqual(stateManager.getBalance(user, `cYES:${marketId}`), 0n);
    assert.strictEqual(stateManager.getBalance(user, 'cUSDC'), usdcBefore + yesBalance);
  });

  test('quoteBuyYes returns expected values', () => {
    const quote = amm.quoteBuyYes(marketId, 100000n);

    assert.ok(quote.amountOut > 0n);
    assert.ok(quote.fee > 0n);
    assert.ok(typeof quote.priceImpact === 'number');
  });
});

describe('Integration', () => {
  test('full trading flow', () => {
    const sealedKey = generateSealedKey();
    const stateManager = new StateManager(sealedKey);
    const amm = new ConfidentialAMM(stateManager);
    const marketId = '0xbtc100k';

    // Initialize
    stateManager.initializePool(marketId, 10000000n);

    // User A deposits and buys YES
    const userA = '0xAlice';
    stateManager.setBalance(userA, 'cUSDC', 1000000n);
    amm.buyYes(marketId, userA, 500000n);

    // User B deposits and buys NO
    const userB = '0xBob';
    stateManager.setBalance(userB, 'cUSDC', 1000000n);
    amm.buyNo(marketId, userB, 500000n);

    // Check prices moved
    const prices = amm.getIndicativePrices(marketId);
    assert.ok(prices.yes > 0 && prices.yes < 1);
    assert.ok(prices.no > 0 && prices.no < 1);
    assert.ok(Math.abs(prices.yes + prices.no - 1) < 0.001);

    // Market resolves - YES wins
    amm.settlePosition(marketId, userA, true);
    amm.settlePosition(marketId, userB, true);

    // Alice should have gained, Bob's cNO is worthless
    assert.ok(stateManager.getBalance(userA, 'cUSDC') > 500000n);
    assert.strictEqual(stateManager.getBalance(userB, `cNO:${marketId}`), 0n);

    // Export and verify state
    const publicState = stateManager.exportPublicState();
    assert.ok(publicState.pools[marketId]);
  });
});
