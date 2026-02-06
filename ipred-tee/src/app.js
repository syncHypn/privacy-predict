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
import { hexToBytes, generateSealedKey, encryptState, decryptBalance, encryptForUser } from './encryption.js';
import { StateManager } from './stateManager.js';
import { ConfidentialAMM } from './amm.js';
import { generateCallbackData } from './chainWriter.js';
import { ChainReader } from './chainReader.js';

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
    const args = process.argv.slice(2);
    console.log(`Received ${args.length} args:`, args);

    if (args.length === 0) {
      throw new Error('MISSING_ARGS: At least one argument required (market ID or "balance")');
    }

    // ── Balance query mode ──
    if (args[0] === 'balance') {
      result = await handleBalanceQuery(args, IEXEC_OUT);
      computedJsonObj = {
        'deterministic-output-path': path.join(IEXEC_OUT, 'result.json'),
      };
      return;
    }

    const marketId = args[0];
    console.log(`Processing market: ${marketId}`);

    // Get sealed key from TEE secrets
    const sealedKey = await getSealedKey();
    console.log('Sealed key loaded');

    // Initialize state manager with sealed key
    const stateManager = new StateManager(sealedKey);

    // Initialize AMM
    const amm = new ConfidentialAMM(stateManager);

    // Load previous state or initialize
    await loadOrInitializeState(stateManager, sealedKey, marketId);

    // Process deposits from input files
    await processDeposits(stateManager);

    // Process pending orders from input files
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

    // Write state metadata
    const metadata = {
      marketId,
      stateRoot,
      version: stateManager.getVersion(),
      timestamp: Date.now(),
      ordersProcessed,
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
    });

    // Write callback data
    await fs.writeFile(
      path.join(IEXEC_OUT, 'callback-data.json'),
      JSON.stringify(callbackData, null, 2)
    );
    console.log('Callback data written');

    // Build result summary
    result = {
      success: true,
      marketId,
      stateRoot,
      version: stateManager.getVersion(),
      ordersProcessed,
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
    computedJsonObj = {
      'deterministic-output-path': path.join(IEXEC_OUT, 'result.json'),
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
async function readInputFile(pattern) {
  const inputDir = getInputDir();
  if (!inputDir) return null;

  // Check via environment variables first (old pattern)
  const inputCount = parseInt(process.env.IEXEC_INPUT_FILES_NUMBER || '0');
  for (let i = 1; i <= inputCount; i++) {
    const fileName = process.env[`IEXEC_INPUT_FILE_NAME_${i}`];
    if (fileName && fileName.includes(pattern)) {
      const filePath = path.join(inputDir, fileName);
      try {
        return await fs.readFile(filePath, 'utf8');
      } catch {
        continue;
      }
    }
  }

  // Try direct file access (new pattern)
  try {
    const files = await fs.readdir(inputDir);
    for (const file of files) {
      if (file.includes(pattern)) {
        return await fs.readFile(path.join(inputDir, file), 'utf8');
      }
    }
  } catch {
    // Directory doesn't exist or is empty
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
  // Try to load public state
  const publicStateContent = await readInputFile('public-state.json');
  if (publicStateContent) {
    try {
      const publicState = JSON.parse(publicStateContent);
      stateManager.importPublicState(publicState);
      console.log('Loaded public state from input');
    } catch (e) {
      console.log('Failed to parse public state:', e.message);
    }
  }

  // Try to load private state
  const privateStateContent = await readInputFile('private-state.enc');
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
  const depositsContent = await readInputFile('deposits.json');
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
 * Processes order entries from input files
 * @param {ConfidentialAMM} amm
 * @param {StateManager} stateManager
 * @param {string} marketId
 * @returns {Promise<number>}
 */
async function processOrders(amm, stateManager, marketId) {
  const ordersContent = await readInputFile('orders.json');
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
// Balance Query Handler
// ============================================================

/**
 * Handles a balance query request.
 * Args: balance <userAddress> <signature> <userNaclPubkeyHex>
 *
 * 1. Verify Ethereum signature to prove address ownership
 * 2. Read encrypted balance from PrivateToken contract
 * 3. Decrypt with sealed key
 * 4. Re-encrypt with user's ephemeral NaCl public key
 * 5. Output result
 *
 * @param {string[]} args - CLI arguments
 * @param {string} outputDir - IEXEC_OUT path
 * @returns {Promise<Object>} Result object
 */
async function handleBalanceQuery(args, outputDir) {
  if (args.length < 4) {
    throw new Error(
      'BALANCE_QUERY: Requires args: balance <userAddress> <signature> <userNaclPubkeyHex>'
    );
  }

  const userAddress = args[1];
  const signature = args[2];
  const userNaclPubkeyHex = args[3];

  console.log(`=== Balance Query for ${userAddress} ===`);

  // 1. Verify signature
  const message = `iPred balance query: ${userAddress.toLowerCase()}`;
  const recoveredAddress = ethers.verifyMessage(message, signature);
  if (recoveredAddress.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error(
      `INVALID_SIGNATURE: Expected ${userAddress}, recovered ${recoveredAddress}`
    );
  }
  console.log('Signature verified');

  // 2. Get sealed key
  const sealedKey = await getSealedKey();

  // 3. Read encrypted balance from chain
  const chainReader = new ChainReader({
    rpcUrl: CONFIG.rpcUrl,
    orderQueueAddress: CONFIG.contracts.orderQueue,
    marketFactoryAddress: CONFIG.contracts.marketFactory,
    privateTokenAddress: CONFIG.contracts.privateToken,
    teeSecretKey: sealedKey,
  });

  const encryptedBalances = await chainReader.getEncryptedBalance(userAddress);

  if (!encryptedBalances) {
    console.log('No balance found for user');
    const result = {
      success: true,
      action: 'balance',
      userAddress,
      balances: null,
      timestamp: Date.now(),
    };
    await fs.writeFile(
      path.join(outputDir, 'result.json'),
      JSON.stringify(result, null, 2)
    );
    return result;
  }

  // 4. Decrypt each token balance with sealed key
  const plaintextBalances = {};
  for (const [token, encrypted] of Object.entries(encryptedBalances)) {
    try {
      const value = decryptBalance(encrypted, sealedKey);
      plaintextBalances[token] = value.toString();
    } catch (e) {
      console.error(`Failed to decrypt balance for ${token}:`, e.message);
      plaintextBalances[token] = '0';
    }
  }
  console.log(`Decrypted ${Object.keys(plaintextBalances).length} token balances`);

  // 5. Re-encrypt with user's NaCl public key
  const userPubkey = hexToBytes(userNaclPubkeyHex);
  const encrypted = encryptForUser(JSON.stringify(plaintextBalances), userPubkey);

  // 6. Write result
  const result = {
    success: true,
    action: 'balance',
    userAddress,
    encrypted,
    timestamp: Date.now(),
  };

  await fs.writeFile(
    path.join(outputDir, 'result.json'),
    JSON.stringify(result, null, 2)
  );

  console.log('=== Balance Query Complete ===');
  return result;
}

// ============================================================
// Run
// ============================================================

main();
