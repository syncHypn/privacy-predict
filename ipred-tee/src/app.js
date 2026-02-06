/**
 * iPred TEE iApp - Main Entry Point
 *
 * Confidential Prediction Market matching engine running inside iExec TEE.
 *
 * Flow:
 * 1. Load sealed key from TEE secrets
 * 2. Load previous state from input files (or initialize)
 * 3. Process deposits and pending orders
 * 4. Execute swaps against AMM
 * 5. Output state files and callback data
 *
 * iExec Environment Variables:
 * - IEXEC_OUT: Output directory for results
 * - IEXEC_IN / IEXEC_INPUT_FILES_FOLDER: Input files directory
 * - IEXEC_APP_DEVELOPER_SECRET: App's sealed key
 * - IEXEC_REQUESTER_SECRET_*: Per-request secrets
 * - IEXEC_INPUT_FILE_NAME_*: Names of downloaded input files
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ethers } from 'ethers';
import { IExecDataProtectorDeserializer } from '@iexec/dataprotector-deserializer';
import { hexToBytes, generateSealedKey, encryptState } from './encryption.js';
import { StateManager } from './stateManager.js';
import { ConfidentialAMM } from './amm.js';
import { generateCallbackData } from './chainWriter.js';

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  // Contract addresses on Arbitrum Sepolia (from CLAUDE.md)
  contracts: {
    privateToken: '0x7402c579e7a661b3fda0553e511d14bf0aadcab9',
    marketFactory: '0x3555b28e59e32b6d0d81de5ff123cbe73d518592',
    orderQueue: '0x67b830886a47bbb5f2019eb129e81f217ec56f09',
    stateAnchor: '0x074af457ea1c58752705ce157f6892e5bbfc5988',
  },
  // RPC endpoint (can be overridden via IEXEC_REQUESTER_SECRET_1)
  rpcUrl: process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc',
  // Default initial liquidity for new pools (1000 USDC with 6 decimals)
  defaultInitialLiquidity: 1000_000000n,
};

// ============================================================
// Main Entry Point
// ============================================================

const main = async () => {
  const { IEXEC_OUT } = process.env;

  // Ensure output directory exists
  if (!IEXEC_OUT) {
    console.error('ERROR: IEXEC_OUT environment variable not set');
    process.exit(1);
  }

  let computedJsonObj = {};
  let result = {};

  try {
    console.log('=== iPred TEE iApp Starting ===');
    console.log(`Output directory: ${IEXEC_OUT}`);

    // Parse command line arguments
    // Expected: marketId as first argument
    // Use format: "market=0x..." or "0x..." (hex string)
    const rawArgs = process.argv.slice(2);
    console.log(`Received ${rawArgs.length} raw args:`, rawArgs);

    const argsString = rawArgs.join(' ').trim();
    if (!argsString) {
      throw new Error('MISSING_MARKET_ID: Market ID required. Use: --args "market=0x..."');
    }

    // Parse key=value args
    let marketId = null;
    for (const arg of argsString.split(' ')) {
      if (arg.startsWith('market=')) {
        marketId = arg.substring(7); // Remove "market=" prefix
        break;
      }
    }

    // Fallback: use first arg if no market= prefix found
    if (!marketId) {
      marketId = argsString.split(' ')[0];
    }

    // Validate marketId format
    if (!marketId || marketId.length === 0) {
      throw new Error('INVALID_MARKET_ID: Market ID is empty');
    }

    console.log(`Processing market: ${marketId}`);

    // Get sealed key from TEE secrets
    const sealedKey = await getSealedKey();
    console.log('Sealed key loaded');

    // Initialize state manager with sealed key
    const stateManager = new StateManager(sealedKey);

    // Initialize AMM
    const amm = new ConfidentialAMM(stateManager);

    // Load previous state or initialize
    // Input file convention: #3=public-state.json, #4=private-state.enc
    await loadOrInitializeState(stateManager, sealedKey, marketId);

    // Process deposits from input files (#1=deposits.json)
    await processDeposits(stateManager);

    // Process withdrawals from input files (#5=withdrawals.json)
    const { withdrawalsProcessed, validatedWithdrawals } = await processWithdrawals(stateManager, marketId);

    // Process pending orders from input files (#2=orders.json)
    const ordersProcessed = await processOrders(amm, stateManager, marketId);

    // Update state version
    stateManager.incrementVersion();

    // Export state
    const publicState = stateManager.exportPublicState();
    const privateState = stateManager.exportPrivateState();
    const stateRoot = stateManager.computeStateRoot();

    // Write public state (plaintext - for price computation)
    await fs.writeFile(
      path.join(IEXEC_OUT, 'public-state.json'),
      JSON.stringify(publicState, null, 2)
    );
    console.log('Public state written');

    // Write private state (encrypted)
    const encryptedPrivateState = encryptState(privateState, sealedKey);
    await fs.writeFile(
      path.join(IEXEC_OUT, 'private-state.enc'),
      encryptedPrivateState
    );
    console.log('Private state written (encrypted)');

    // Write withdrawal data for relayer (to call processWithdrawal on-chain)
    if (validatedWithdrawals.length > 0) {
      await fs.writeFile(
        path.join(IEXEC_OUT, 'withdrawal-data.json'),
        JSON.stringify(validatedWithdrawals, null, 2)
      );
      console.log(`Withdrawal data written (${validatedWithdrawals.length} withdrawals)`);
    }

    // Write state metadata
    const metadata = {
      marketId,
      stateRoot,
      version: stateManager.getVersion(),
      timestamp: Date.now(),
      ordersProcessed,
      withdrawalsProcessed,
    };
    await fs.writeFile(
      path.join(IEXEC_OUT, 'state-metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    console.log('State metadata written');

    // Prepare callback data for on-chain updates
    const { users, encryptedBalances } = stateManager.prepareBatchUpdate();
    const matchId = `0x${Date.now().toString(16).padStart(64, '0')}`;

    const callbackData = generateCallbackData({
      users,
      encryptedBalances,
      stateRoot,
      matchId,
      withdrawals: validatedWithdrawals,
    });

    // Write callback data (legacy JSON format for manual relayer)
    await fs.writeFile(
      path.join(IEXEC_OUT, 'callback-data.json'),
      JSON.stringify(callbackData, null, 2)
    );
    console.log('Callback data written');

    // ABI-encode lightweight callback payload for iExec on-chain callback
    // Only state root + attestation (fits within 200k gas limit)
    // Balance updates are applied separately via applyBalanceUpdate()
    // Schema: (bytes32 stateRoot, bytes32 matchId, bytes attestation)
    const abiCoder = new ethers.AbiCoder();
    const attestationBytes = ethers.toUtf8Bytes(callbackData.attestation);

    const abiEncodedCallback = abiCoder.encode(
      ['bytes32', 'bytes32', 'bytes'],
      [stateRoot, matchId, attestationBytes]
    );
    console.log(`ABI-encoded callback: ${abiEncodedCallback.length} bytes`);

    // Build result summary
    result = {
      success: true,
      marketId,
      stateRoot,
      version: stateManager.getVersion(),
      ordersProcessed,
      withdrawalsProcessed,
      usersUpdated: users.length,
      prices: stateManager.getIndicativePrices(marketId),
      timestamp: Date.now(),
    };

    // Write result
    await fs.writeFile(
      path.join(IEXEC_OUT, 'result.json'),
      JSON.stringify(result, null, 2)
    );

    console.log('=== iPred TEE iApp Complete ===');
    console.log(`Orders processed: ${ordersProcessed}`);
    console.log(`Users updated: ${users.length}`);
    console.log(`Prices:`, result.prices);

    // Build computed.json for iExec (REQUIRED)
    // callback-data: ABI-encoded bytes sent to CallbackReceiver.receiveResult()
    computedJsonObj = {
      'deterministic-output-path': path.join(IEXEC_OUT, 'result.json'),
      'callback-data': abiEncodedCallback,
    };

  } catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);

    result = {
      success: false,
      error: e.message,
      timestamp: Date.now(),
    };

    await fs.writeFile(
      path.join(IEXEC_OUT, 'result.json'),
      JSON.stringify(result, null, 2)
    );

    computedJsonObj = {
      'deterministic-output-path': path.join(IEXEC_OUT, 'result.json'),
      'error-message': e.message,
    };
  } finally {
    // Save computed.json for iExec validation (REQUIRED)
    await fs.writeFile(
      path.join(IEXEC_OUT, 'computed.json'),
      JSON.stringify(computedJsonObj)
    );
  }
};

// ============================================================
// Helper Functions
// ============================================================

/**
 * Gets the input files directory (supports both old and new iExec patterns)
 * @returns {string | null}
 */
function getInputDir() {
  // New pattern (iApp Generator)
  if (process.env.IEXEC_INPUT_FILES_FOLDER) {
    return process.env.IEXEC_INPUT_FILES_FOLDER;
  }
  // Old pattern
  if (process.env.IEXEC_IN) {
    return process.env.IEXEC_IN;
  }
  // Local development fallback
  return './input';
}

/**
 * Reads an input file by name pattern
 * @param {string} pattern - Filename to look for (e.g., 'orders.json')
 * @returns {Promise<string | null>}
 */
async function readInputFile(pattern, expectedIndex = null) {
  const inputDir = getInputDir();
  console.log(`[readInputFile] Looking for "${pattern}" (index=${expectedIndex}) in dir: ${inputDir}`);
  console.log(`[readInputFile] IEXEC_IN=${process.env.IEXEC_IN}, IEXEC_INPUT_FILES_FOLDER=${process.env.IEXEC_INPUT_FILES_FOLDER}`);
  const inputCount = parseInt(process.env.IEXEC_INPUT_FILES_NUMBER || '0');
  console.log(`[readInputFile] IEXEC_INPUT_FILES_NUMBER=${inputCount}`);
  if (!inputDir) return null;

  // Strategy 1: Read by expected index (most reliable for TEE)
  if (expectedIndex && inputCount >= expectedIndex) {
    const fileName = process.env[`IEXEC_INPUT_FILE_NAME_${expectedIndex}`];
    console.log(`[readInputFile] Index ${expectedIndex} -> fileName=${fileName}`);
    if (fileName) {
      const filePath = path.join(inputDir, fileName);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        console.log(`[readInputFile] Read by index ${expectedIndex}: ${filePath} (${content.length} bytes)`);
        return content;
      } catch (e) {
        console.log(`[readInputFile] Failed to read by index: ${e.message}`);
      }
    }
  }

  // Strategy 2: Match by filename pattern in env vars
  for (let i = 1; i <= inputCount; i++) {
    const fileName = process.env[`IEXEC_INPUT_FILE_NAME_${i}`];
    console.log(`[readInputFile] IEXEC_INPUT_FILE_NAME_${i}=${fileName}`);
    if (fileName && fileName.includes(pattern)) {
      const filePath = path.join(inputDir, fileName);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        console.log(`[readInputFile] Found "${pattern}" at ${filePath} (${content.length} bytes)`);
        return content;
      } catch (e) {
        console.log(`[readInputFile] Failed to read ${filePath}: ${e.message}`);
        continue;
      }
    }
  }

  // Strategy 3: Directory listing with pattern match
  try {
    const files = await fs.readdir(inputDir);
    console.log(`[readInputFile] Directory listing of ${inputDir}:`, files);
    for (const file of files) {
      if (file.includes(pattern)) {
        const content = await fs.readFile(path.join(inputDir, file), 'utf8');
        console.log(`[readInputFile] Found "${pattern}" via listing at ${file} (${content.length} bytes)`);
        return content;
      }
    }
  } catch (e) {
    console.log(`[readInputFile] Cannot read dir ${inputDir}: ${e.message}`);
  }

  return null;
}

/**
 * Gets the sealed key from TEE secrets or generates a new one
 * @returns {Promise<Uint8Array>}
 */
async function getSealedKey() {
  // Priority 1: App developer secret (recommended for production)
  const { IEXEC_APP_DEVELOPER_SECRET } = process.env;
  if (IEXEC_APP_DEVELOPER_SECRET) {
    console.log('Using app developer secret as sealed key');
    if (IEXEC_APP_DEVELOPER_SECRET.startsWith('0x')) {
      return hexToBytes(IEXEC_APP_DEVELOPER_SECRET);
    }
    return new Uint8Array(Buffer.from(IEXEC_APP_DEVELOPER_SECRET, 'base64'));
  }

  // Priority 2: Requester secret (for per-user keys)
  const requesterSecret = process.env.IEXEC_REQUESTER_SECRET_1;
  if (requesterSecret) {
    console.log('Using requester secret as sealed key');
    if (requesterSecret.startsWith('0x')) {
      return hexToBytes(requesterSecret);
    }
    return new Uint8Array(Buffer.from(requesterSecret, 'base64'));
  }

  // Priority 3: Protected data (DataProtector pattern)
  try {
    const deserializer = new IExecDataProtectorDeserializer();
    const sealedKeyHex = await deserializer.getValue('sealedKey', 'string');
    console.log('Using protected data sealed key');
    return hexToBytes(sealedKeyHex);
  } catch {
    console.log('No protected sealed key found');
  }

  // Fallback: Generate new key (WARNING: not persistent across runs!)
  console.log('WARNING: Generating new sealed key (not persistent)');
  return generateSealedKey();
}

/**
 * Loads state from input files or initializes a new pool
 * @param {StateManager} stateManager
 * @param {Uint8Array} sealedKey
 * @param {string} marketId
 */
async function loadOrInitializeState(stateManager, sealedKey, marketId) {
  // Try to load public state (input file #3 if provided)
  const publicStateContent = await readInputFile('public-state.json', 3);
  if (publicStateContent) {
    try {
      const publicState = JSON.parse(publicStateContent);
      stateManager.importPublicState(publicState);
      console.log('Loaded public state from input');
    } catch (e) {
      console.log('Failed to parse public state:', e.message);
    }
  }

  // Try to load private state (input file #4 if provided)
  const privateStateContent = await readInputFile('private-state.enc', 4);
  if (privateStateContent) {
    try {
      const { decryptState } = await import('./encryption.js');
      const privateState = decryptState(privateStateContent, sealedKey);
      stateManager.importPrivateState(privateState);
      console.log('Loaded private state from input');
    } catch (e) {
      console.log('Failed to decrypt private state:', e.message);
    }
  }

  // Check if pool exists, otherwise initialize
  if (!stateManager.getPool(marketId)) {
    console.log(`Initializing new pool for market ${marketId}`);
    stateManager.initializePool(marketId, CONFIG.defaultInitialLiquidity);
    console.log(`Pool initialized with ${CONFIG.defaultInitialLiquidity} liquidity`);
  } else {
    console.log('State loaded successfully');
  }
}

/**
 * Processes deposit entries from input files
 * @param {StateManager} stateManager
 */
async function processDeposits(stateManager) {
  const depositsContent = await readInputFile('deposits.json', 1);
  if (!depositsContent) {
    console.log('No deposits file found');
    return;
  }

  try {
    const deposits = JSON.parse(depositsContent);
    console.log(`Processing ${deposits.length} deposits`);

    for (const deposit of deposits) {
      stateManager.addBalance(deposit.user, 'cUSDC', BigInt(deposit.amount));
      console.log(`Deposited ${deposit.amount} cUSDC for ${deposit.user}`);
    }
  } catch (e) {
    console.error('Failed to process deposits:', e.message);
  }
}

/**
 * Processes withdrawal requests from input files
 * @param {StateManager} stateManager
 * @param {string} marketId
 * @returns {Promise<{ withdrawalsProcessed: number, validatedWithdrawals: Array }>}
 */
async function processWithdrawals(stateManager, marketId) {
  const withdrawalsContent = await readInputFile('withdrawals.json', 5);
  if (!withdrawalsContent) {
    console.log('No withdrawals file found');
    return { withdrawalsProcessed: 0, validatedWithdrawals: [] };
  }

  let withdrawalsProcessed = 0;
  const validatedWithdrawals = [];

  try {
    const withdrawals = JSON.parse(withdrawalsContent);
    console.log(`Processing ${withdrawals.length} withdrawal requests`);

    for (const withdrawal of withdrawals) {
      const { withdrawalId, user, amount: amountStr } = withdrawal;

      // Skip already processed withdrawals (reuse order tracking)
      if (stateManager.isOrderProcessed(withdrawalId)) {
        console.log(`Skipping already processed withdrawal ${withdrawalId}`);
        continue;
      }

      try {
        const amount = BigInt(amountStr);

        // Validate sufficient cUSDC balance
        const balance = stateManager.getBalance(user, 'cUSDC');
        if (balance < amount) {
          console.error(`Withdrawal ${withdrawalId} rejected: ${user} has ${balance} cUSDC, needs ${amount}`);
          continue;
        }

        // Deduct balance
        stateManager.subtractBalance(user, 'cUSDC', amount);

        // Generate proof for on-chain replay prevention
        const proofData = ethers.solidityPackedKeccak256(
          ['string', 'string', 'uint256'],
          [withdrawalId, marketId, stateManager.getVersion()]
        );

        validatedWithdrawals.push({
          user,
          amount: amountStr,
          proof: proofData,
        });

        stateManager.markOrderProcessed(withdrawalId);
        withdrawalsProcessed++;

        console.log(`Withdrawal ${withdrawalId}: ${user} withdrawing ${amount} cUSDC`);

      } catch (e) {
        console.error(`Failed to process withdrawal ${withdrawalId}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error('Failed to parse withdrawals:', e.message);
  }

  return { withdrawalsProcessed, validatedWithdrawals };
}

/**
 * Processes order entries from input files
 * @param {ConfidentialAMM} amm
 * @param {StateManager} stateManager
 * @param {string} marketId
 * @returns {Promise<number>}
 */
async function processOrders(amm, stateManager, marketId) {
  const ordersContent = await readInputFile('orders.json', 2);
  if (!ordersContent) {
    console.log('No orders file found');
    return 0;
  }

  let ordersProcessed = 0;

  try {
    const orders = JSON.parse(ordersContent);
    console.log(`Processing ${orders.length} orders`);

    for (const order of orders) {
      // Skip already processed orders
      if (stateManager.isOrderProcessed(order.orderId)) {
        console.log(`Skipping already processed order ${order.orderId}`);
        continue;
      }

      try {
        const amount = BigInt(order.amount);

        if (order.side === 'BUY') {
          if (order.outcomeIndex === 0) {
            const result = amm.buyYes(marketId, order.user, amount);
            console.log(`BUY YES: ${order.user} spent ${amount} cUSDC, got ${result.amountOut} cYES`);
          } else {
            const result = amm.buyNo(marketId, order.user, amount);
            console.log(`BUY NO: ${order.user} spent ${amount} cUSDC, got ${result.amountOut} cNO`);
          }
        } else {
          if (order.outcomeIndex === 0) {
            const result = amm.sellYes(marketId, order.user, amount);
            console.log(`SELL YES: ${order.user} sold ${amount} cYES, got ${result.amountOut} cUSDC`);
          } else {
            const result = amm.sellNo(marketId, order.user, amount);
            console.log(`SELL NO: ${order.user} sold ${amount} cNO, got ${result.amountOut} cUSDC`);
          }
        }

        stateManager.markOrderProcessed(order.orderId);
        ordersProcessed++;

      } catch (e) {
        console.error(`Failed to process order ${order.orderId}: ${e.message}`);
      }
    }
  } catch (e) {
    console.error('Failed to parse orders:', e.message);
  }

  return ordersProcessed;
}

// ============================================================
// Run
// ============================================================

main();
