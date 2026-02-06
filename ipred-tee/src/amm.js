/**
 * Confidential AMM for iPred TEE
 * Implements constant product (x * y = k) market maker
 *
 * Based on Uniswap V2 formula with adaptations for prediction markets:
 * - Two pools per market: USDC-YES and USDC-NO
 * - Prices constrained: P(YES) + P(NO) = 1
 */

import { StateManager } from './stateManager.js';

/** Trading fee in basis points (0.3% = 30 bps) */
const FEE_BPS = 30n;
const BPS_DENOMINATOR = 10000n;

/**
 * @typedef {Object} SwapResult
 * @property {bigint} amountOut - Amount of tokens received
 * @property {bigint} fee - Fee paid
 * @property {number} priceImpact - Price impact percentage
 * @property {{ yes: number, no: number }} newPrices - New indicative prices
 */

export class ConfidentialAMM {
  /** @type {StateManager} */
  #stateManager;

  /**
   * @param {StateManager} stateManager
   */
  constructor(stateManager) {
    this.#stateManager = stateManager;
  }

  // ============================================================
  // Price Calculation
  // ============================================================

  /**
   * Gets indicative prices for a market
   * @param {string} marketId
   * @returns {{ yes: number, no: number } | undefined}
   */
  getIndicativePrices(marketId) {
    return this.#stateManager.getIndicativePrices(marketId);
  }

  /**
   * Calculates amount out for a swap (constant product formula)
   * @param {bigint} amountIn - Amount of input tokens
   * @param {bigint} reserveIn - Reserve of input token
   * @param {bigint} reserveOut - Reserve of output token
   * @returns {{ amountOut: bigint, fee: bigint }}
   */
  #getAmountOut(amountIn, reserveIn, reserveOut) {
    // Apply fee: amountInWithFee = amountIn * (10000 - 30) / 10000
    const amountInWithFee = amountIn * (BPS_DENOMINATOR - FEE_BPS);
    const fee = amountIn * FEE_BPS / BPS_DENOMINATOR;

    // Constant product: (reserveIn + amountInWithFee) * (reserveOut - amountOut) = k
    // Solving for amountOut:
    // amountOut = reserveOut * amountInWithFee / (reserveIn * 10000 + amountInWithFee)
    const numerator = amountInWithFee * reserveOut;
    const denominator = reserveIn * BPS_DENOMINATOR + amountInWithFee;
    const amountOut = numerator / denominator;

    return { amountOut, fee };
  }

  /**
   * Calculates amount in required for a desired output (constant product formula)
   * @param {bigint} amountOut - Desired amount of output tokens
   * @param {bigint} reserveIn - Reserve of input token
   * @param {bigint} reserveOut - Reserve of output token
   * @returns {{ amountIn: bigint, fee: bigint }}
   */
  #getAmountIn(amountOut, reserveIn, reserveOut) {
    // Constant product: amountIn = reserveIn * amountOut / (reserveOut - amountOut)
    // With fee: amountIn = (reserveIn * amountOut * 10000) / ((reserveOut - amountOut) * (10000 - 30))
    const numerator = reserveIn * amountOut * BPS_DENOMINATOR;
    const denominator = (reserveOut - amountOut) * (BPS_DENOMINATOR - FEE_BPS);
    const amountIn = numerator / denominator + 1n; // Round up

    const fee = amountIn * FEE_BPS / BPS_DENOMINATOR;

    return { amountIn, fee };
  }

  /**
   * Calculates price impact for a trade
   * @param {bigint} amountIn
   * @param {bigint} reserveIn
   * @param {bigint} reserveOut
   * @returns {number} Price impact as percentage (0-100)
   */
  #calculatePriceImpact(amountIn, reserveIn, reserveOut) {
    // Spot price before trade
    const spotPrice = Number(reserveIn) / Number(reserveOut);

    // Effective price after trade
    const { amountOut } = this.#getAmountOut(amountIn, reserveIn, reserveOut);
    const effectivePrice = Number(amountIn) / Number(amountOut);

    // Price impact = (effectivePrice - spotPrice) / spotPrice * 100
    return ((effectivePrice - spotPrice) / spotPrice) * 100;
  }

  // ============================================================
  // Buy Operations
  // ============================================================

  /**
   * Buys YES tokens with USDC
   * @param {string} marketId
   * @param {string} user - User address
   * @param {bigint} usdcAmount - Amount of USDC to spend
   * @returns {SwapResult}
   */
  buyYes(marketId, user, usdcAmount) {
    const pool = this.#stateManager.getPool(marketId);
    if (!pool) {
      throw new Error(`POOL_NOT_FOUND: Market ${marketId} not found`);
    }

    // Check user has enough cUSDC
    const userBalance = this.#stateManager.getBalance(user, 'cUSDC');
    if (userBalance < usdcAmount) {
      throw new Error(`INSUFFICIENT_BALANCE: User has ${userBalance} cUSDC, needs ${usdcAmount}`);
    }

    // Calculate price impact
    const priceImpact = this.#calculatePriceImpact(usdcAmount, pool.usdc, pool.yes);

    // Calculate YES tokens to receive
    const { amountOut, fee } = this.#getAmountOut(usdcAmount, pool.usdc, pool.yes);

    // Update pool reserves
    const newReserves = {
      usdc: pool.usdc + usdcAmount,
      yes: pool.yes - amountOut,
      no: pool.no, // NO pool unchanged
    };
    this.#stateManager.updatePool(marketId, newReserves);

    // Update user balances
    this.#stateManager.subtractBalance(user, 'cUSDC', usdcAmount);
    this.#stateManager.addBalance(user, `cYES:${marketId}`, amountOut);

    return {
      amountOut,
      fee,
      priceImpact,
      newPrices: this.getIndicativePrices(marketId),
    };
  }

  /**
   * Buys NO tokens with USDC
   * @param {string} marketId
   * @param {string} user - User address
   * @param {bigint} usdcAmount - Amount of USDC to spend
   * @returns {SwapResult}
   */
  buyNo(marketId, user, usdcAmount) {
    const pool = this.#stateManager.getPool(marketId);
    if (!pool) {
      throw new Error(`POOL_NOT_FOUND: Market ${marketId} not found`);
    }

    // Check user has enough cUSDC
    const userBalance = this.#stateManager.getBalance(user, 'cUSDC');
    if (userBalance < usdcAmount) {
      throw new Error(`INSUFFICIENT_BALANCE: User has ${userBalance} cUSDC, needs ${usdcAmount}`);
    }

    // Calculate price impact
    const priceImpact = this.#calculatePriceImpact(usdcAmount, pool.usdc, pool.no);

    // Calculate NO tokens to receive
    const { amountOut, fee } = this.#getAmountOut(usdcAmount, pool.usdc, pool.no);

    // Update pool reserves
    const newReserves = {
      usdc: pool.usdc + usdcAmount,
      yes: pool.yes, // YES pool unchanged
      no: pool.no - amountOut,
    };
    this.#stateManager.updatePool(marketId, newReserves);

    // Update user balances
    this.#stateManager.subtractBalance(user, 'cUSDC', usdcAmount);
    this.#stateManager.addBalance(user, `cNO:${marketId}`, amountOut);

    return {
      amountOut,
      fee,
      priceImpact,
      newPrices: this.getIndicativePrices(marketId),
    };
  }

  // ============================================================
  // Sell Operations
  // ============================================================

  /**
   * Sells YES tokens for USDC
   * @param {string} marketId
   * @param {string} user - User address
   * @param {bigint} yesAmount - Amount of YES tokens to sell
   * @returns {SwapResult}
   */
  sellYes(marketId, user, yesAmount) {
    const pool = this.#stateManager.getPool(marketId);
    if (!pool) {
      throw new Error(`POOL_NOT_FOUND: Market ${marketId} not found`);
    }

    // Check user has enough cYES
    const userBalance = this.#stateManager.getBalance(user, `cYES:${marketId}`);
    if (userBalance < yesAmount) {
      throw new Error(`INSUFFICIENT_BALANCE: User has ${userBalance} cYES, needs ${yesAmount}`);
    }

    // Calculate price impact (selling YES = adding YES, getting USDC)
    const priceImpact = this.#calculatePriceImpact(yesAmount, pool.yes, pool.usdc);

    // Calculate USDC to receive
    const { amountOut, fee } = this.#getAmountOut(yesAmount, pool.yes, pool.usdc);

    // Update pool reserves
    const newReserves = {
      usdc: pool.usdc - amountOut,
      yes: pool.yes + yesAmount,
      no: pool.no,
    };
    this.#stateManager.updatePool(marketId, newReserves);

    // Update user balances
    this.#stateManager.subtractBalance(user, `cYES:${marketId}`, yesAmount);
    this.#stateManager.addBalance(user, 'cUSDC', amountOut);

    return {
      amountOut,
      fee,
      priceImpact,
      newPrices: this.getIndicativePrices(marketId),
    };
  }

  /**
   * Sells NO tokens for USDC
   * @param {string} marketId
   * @param {string} user - User address
   * @param {bigint} noAmount - Amount of NO tokens to sell
   * @returns {SwapResult}
   */
  sellNo(marketId, user, noAmount) {
    const pool = this.#stateManager.getPool(marketId);
    if (!pool) {
      throw new Error(`POOL_NOT_FOUND: Market ${marketId} not found`);
    }

    // Check user has enough cNO
    const userBalance = this.#stateManager.getBalance(user, `cNO:${marketId}`);
    if (userBalance < noAmount) {
      throw new Error(`INSUFFICIENT_BALANCE: User has ${userBalance} cNO, needs ${noAmount}`);
    }

    // Calculate price impact
    const priceImpact = this.#calculatePriceImpact(noAmount, pool.no, pool.usdc);

    // Calculate USDC to receive
    const { amountOut, fee } = this.#getAmountOut(noAmount, pool.no, pool.usdc);

    // Update pool reserves
    const newReserves = {
      usdc: pool.usdc - amountOut,
      yes: pool.yes,
      no: pool.no + noAmount,
    };
    this.#stateManager.updatePool(marketId, newReserves);

    // Update user balances
    this.#stateManager.subtractBalance(user, `cNO:${marketId}`, noAmount);
    this.#stateManager.addBalance(user, 'cUSDC', amountOut);

    return {
      amountOut,
      fee,
      priceImpact,
      newPrices: this.getIndicativePrices(marketId),
    };
  }

  // ============================================================
  // Quote Functions (Read-Only)
  // ============================================================

  /**
   * Gets a quote for buying YES tokens
   * @param {string} marketId
   * @param {bigint} usdcAmount
   * @returns {{ amountOut: bigint, fee: bigint, priceImpact: number }}
   */
  quoteBuyYes(marketId, usdcAmount) {
    const pool = this.#stateManager.getPool(marketId);
    if (!pool) {
      throw new Error(`POOL_NOT_FOUND: Market ${marketId} not found`);
    }

    const { amountOut, fee } = this.#getAmountOut(usdcAmount, pool.usdc, pool.yes);
    const priceImpact = this.#calculatePriceImpact(usdcAmount, pool.usdc, pool.yes);

    return { amountOut, fee, priceImpact };
  }

  /**
   * Gets a quote for buying NO tokens
   * @param {string} marketId
   * @param {bigint} usdcAmount
   * @returns {{ amountOut: bigint, fee: bigint, priceImpact: number }}
   */
  quoteBuyNo(marketId, usdcAmount) {
    const pool = this.#stateManager.getPool(marketId);
    if (!pool) {
      throw new Error(`POOL_NOT_FOUND: Market ${marketId} not found`);
    }

    const { amountOut, fee } = this.#getAmountOut(usdcAmount, pool.usdc, pool.no);
    const priceImpact = this.#calculatePriceImpact(usdcAmount, pool.usdc, pool.no);

    return { amountOut, fee, priceImpact };
  }

  /**
   * Gets a quote for selling YES tokens
   * @param {string} marketId
   * @param {bigint} yesAmount
   * @returns {{ amountOut: bigint, fee: bigint, priceImpact: number }}
   */
  quoteSellYes(marketId, yesAmount) {
    const pool = this.#stateManager.getPool(marketId);
    if (!pool) {
      throw new Error(`POOL_NOT_FOUND: Market ${marketId} not found`);
    }

    const { amountOut, fee } = this.#getAmountOut(yesAmount, pool.yes, pool.usdc);
    const priceImpact = this.#calculatePriceImpact(yesAmount, pool.yes, pool.usdc);

    return { amountOut, fee, priceImpact };
  }

  /**
   * Gets a quote for selling NO tokens
   * @param {string} marketId
   * @param {bigint} noAmount
   * @returns {{ amountOut: bigint, fee: bigint, priceImpact: number }}
   */
  quoteSellNo(marketId, noAmount) {
    const pool = this.#stateManager.getPool(marketId);
    if (!pool) {
      throw new Error(`POOL_NOT_FOUND: Market ${marketId} not found`);
    }

    const { amountOut, fee } = this.#getAmountOut(noAmount, pool.no, pool.usdc);
    const priceImpact = this.#calculatePriceImpact(noAmount, pool.no, pool.usdc);

    return { amountOut, fee, priceImpact };
  }

  // ============================================================
  // Settlement
  // ============================================================

  /**
   * Settles a user's position after market resolution
   * @param {string} marketId
   * @param {string} user - User address
   * @param {boolean} outcome - true = YES wins, false = NO wins
   * @returns {{ payout: bigint, winningTokensBurned: bigint, losingTokensBurned: bigint }}
   */
  settlePosition(marketId, user, outcome) {
    const winningToken = outcome ? `cYES:${marketId}` : `cNO:${marketId}`;
    const losingToken = outcome ? `cNO:${marketId}` : `cYES:${marketId}`;

    // Get user's token balances
    const winningBalance = this.#stateManager.getBalance(user, winningToken);
    const losingBalance = this.#stateManager.getBalance(user, losingToken);

    // Winning tokens convert 1:1 to cUSDC
    const payout = winningBalance;

    // Update balances
    if (winningBalance > 0n) {
      this.#stateManager.setBalance(user, winningToken, 0n);
      this.#stateManager.addBalance(user, 'cUSDC', payout);
    }

    if (losingBalance > 0n) {
      this.#stateManager.setBalance(user, losingToken, 0n);
    }

    return {
      payout,
      winningTokensBurned: winningBalance,
      losingTokensBurned: losingBalance,
    };
  }
}

export default ConfidentialAMM;
