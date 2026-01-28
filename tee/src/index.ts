/**
 * iPred TEE Matching Engine
 *
 * Main entry point for the iExec TEE application.
 */

import type { Address, Hex } from 'viem';
import { getConfig, loadConfig } from './config.js';
import { initLogger, getLogger } from './utils/logger.js';
import { isIPredError, wrapError, TEEModeError } from './utils/errors.js';

// State
import { createPMTState } from './state/pmtState.js';
import { createStateManager, InMemoryIPFS } from './state/stateManager.js';
import { createRecoveryManager } from './state/recoveryManager.js';

// Crypto
import { getKeyManager } from './crypto/keyManager.js';
import { decryptOrderInTEE, hexToBytes } from './crypto/encryption.js';

// Blockchain
import { createProviderManager } from './blockchain/providers.js';
import { createEventListener } from './blockchain/eventListener.js';
import { createContractCaller } from './blockchain/contractCaller.js';

// Matching
import { createOrderBook } from './matching/orderBook.js';
import { createPositionManager } from './matching/positionManager.js';
import { createMatcher } from './matching/matcher.js';

// Oracle
import { createOracleClient } from './oracle/oracleClient.js';

import type {
  OrderSubmittedEvent,
  OrderCancelledEvent,
  DepositEvent,
  WithdrawalRequestedEvent,
  MarketResolvedEvent,
  TEEMode,
} from './types.js';

const logger = getLogger();

/**
 * TEE Application instance
 */
class TEEApplication {
  private isRunning = false;
  private mode: TEEMode = 'NORMAL';

  // Managers
  private pmtState = createPMTState();
  private keyManager = getKeyManager();
  private providerManager!: ReturnType<typeof createProviderManager>;
  private stateManager!: ReturnType<typeof createStateManager>;
  private eventListener!: ReturnType<typeof createEventListener>;
  private contractCaller!: ReturnType<typeof createContractCaller>;
  private recoveryManager!: ReturnType<typeof createRecoveryManager>;

  // Matching
  private orderBook!: ReturnType<typeof createOrderBook>;
  private positionManager!: ReturnType<typeof createPositionManager>;
  private matcher!: ReturnType<typeof createMatcher>;
  private oracleClient!: ReturnType<typeof createOracleClient>;

  /**
   * Initialize the TEE application
   */
  async initialize(): Promise<void> {
    logger.info('Initializing TEE application');

    // Load config
    const config = loadConfig();
    initLogger({ level: config.logLevel });

    // Initialize key manager
    await this.keyManager.initializeFromEnv();
    logger.info('Key manager initialized', {
      publicKey: this.keyManager.getPublicKeyHex(),
    });

    // Initialize provider manager
    this.providerManager = createProviderManager({
      rpcUrls: config.rpcUrls,
    });
    this.providerManager.startHealthChecks();

    // Initialize state manager
    const ipfsClient = new InMemoryIPFS(); // Use real IPFS in production
    this.stateManager = createStateManager(
      this.pmtState,
      this.keyManager,
      ipfsClient,
      config.snapshotIntervalMatches
    );

    // Initialize PMT state
    await this.pmtState.initialize();

    // Initialize blockchain components
    const teeSignerPrivateKey = process.env['TEE_SIGNER_PRIVATE_KEY'] as Hex;
    if (!teeSignerPrivateKey) {
      throw new Error('TEE_SIGNER_PRIVATE_KEY environment variable required');
    }

    this.contractCaller = createContractCaller(
      this.providerManager,
      config.contracts,
      teeSignerPrivateKey
    );

    this.eventListener = createEventListener(
      this.providerManager,
      config.contracts,
      config.pollingIntervalMs
    );

    // Initialize recovery manager
    this.recoveryManager = createRecoveryManager(
      this.stateManager,
      this.contractCaller,
      this.eventListener
    );

    // Initialize matching components
    this.orderBook = createOrderBook(this.pmtState);
    this.positionManager = createPositionManager(this.pmtState);
    this.matcher = createMatcher(
      this.orderBook,
      this.positionManager,
      this.stateManager
    );

    // Initialize oracle client
    this.oracleClient = createOracleClient(
      this.positionManager,
      this.stateManager,
      this.contractCaller
    );

    // Register event handlers
    this.registerEventHandlers();

    logger.info('TEE application initialized');
  }

  /**
   * Register event handlers for blockchain events
   */
  private registerEventHandlers(): void {
    // Order submitted
    this.eventListener.onOrderSubmitted(async (event) => {
      await this.handleOrderSubmitted(event);
    });

    // Order cancelled
    this.eventListener.onOrderCancelled(async (event) => {
      await this.handleOrderCancelled(event);
    });

    // Deposit
    this.eventListener.onDeposit(async (event) => {
      await this.handleDeposit(event);
    });

    // Withdrawal requested
    this.eventListener.onWithdrawalRequested(async (event) => {
      await this.handleWithdrawalRequested(event);
    });

    // Market resolved
    this.eventListener.onMarketResolved(async (event) => {
      await this.handleMarketResolved(event);
    });
  }

  /**
   * Handle OrderSubmitted event
   */
  private async handleOrderSubmitted(event: OrderSubmittedEvent): Promise<void> {
    if (this.mode !== 'NORMAL') {
      logger.warn('Order rejected - TEE not in NORMAL mode', {
        orderId: event.orderId,
        mode: this.mode,
      });
      return;
    }

    try {
      logger.info('Processing order', { orderId: event.orderId });

      // Decrypt order payload
      // The encrypted payload contains the user's public key
      // For now, extract it from a known format or require it in the event
      const encryptedBytes = hexToBytes(event.encryptedPayload);

      // First 32 bytes are user's public key (convention)
      const userPublicKey = encryptedBytes.slice(0, 32);
      const encryptedData = encryptedBytes.slice(32);

      const payload = decryptOrderInTEE(
        Buffer.from(encryptedData).toString('base64'),
        userPublicKey,
        this.keyManager.getSecretKey()
      );

      // Process the order
      const result = await this.matcher.processOrder(
        payload,
        event.orderId,
        event.user,
        event.marketId,
        Number(event.timestamp)
      );

      // Commit root to chain
      const attestation = await this.keyManager.generateAttestation();
      await this.contractCaller.commitRoot(
        result.newRoot,
        result.matchId,
        attestation
      );

      // Update last processed block
      await this.stateManager.setLastProcessedBlock(event.blockNumber);

      // Take snapshot if needed
      if (this.stateManager.shouldSnapshot()) {
        await this.stateManager.saveSnapshot();
      }

      logger.info('Order processed successfully', {
        orderId: event.orderId,
        fills: result.fills.length,
        restingOrder: result.restingOrderAdded,
        newRoot: result.newRoot,
      });
    } catch (error) {
      logger.error('Failed to process order', {
        orderId: event.orderId,
        error: String(error),
      });
    }
  }

  /**
   * Handle OrderCancelled event
   */
  private async handleOrderCancelled(event: OrderCancelledEvent): Promise<void> {
    try {
      logger.info('Processing cancellation', { orderId: event.orderId });

      const success = await this.matcher.cancelOrder(event.orderId, event.user);

      if (success) {
        // Commit new state
        const attestation = await this.keyManager.generateAttestation();
        await this.contractCaller.commitRoot(
          this.stateManager.getRoot(),
          event.orderId, // Use orderId as matchId for cancellations
          attestation
        );
      }

      await this.stateManager.setLastProcessedBlock(event.blockNumber);

      logger.info('Cancellation processed', {
        orderId: event.orderId,
        success,
      });
    } catch (error) {
      logger.error('Failed to process cancellation', {
        orderId: event.orderId,
        error: String(error),
      });
    }
  }

  /**
   * Handle Deposit event
   */
  private async handleDeposit(event: DepositEvent): Promise<void> {
    try {
      logger.info('Processing deposit', {
        user: event.user,
      });

      // Add to user's available balance
      await this.stateManager.addAvailableBalance(event.user, event.amount);
      await this.stateManager.setLastProcessedBlock(event.blockNumber);

      logger.info('Deposit processed', { user: event.user });
    } catch (error) {
      logger.error('Failed to process deposit', {
        user: event.user,
        error: String(error),
      });
    }
  }

  /**
   * Handle WithdrawalRequested event
   */
  private async handleWithdrawalRequested(event: WithdrawalRequestedEvent): Promise<void> {
    try {
      logger.info('Processing withdrawal request', { user: event.user });

      // Get user balance
      const balance = await this.stateManager.getBalance(event.user);

      if (balance.available <= 0n) {
        logger.warn('Insufficient balance for withdrawal', {
          user: event.user,
          available: balance.available.toString(),
        });
        return;
      }

      // Process withdrawal
      const proof = await this.keyManager.generateAttestation();
      await this.contractCaller.processWithdrawal(
        event.user,
        balance.available,
        proof
      );

      // Update balance
      await this.stateManager.updateBalance(event.user, {
        available: 0n,
        locked: balance.locked,
      });

      await this.stateManager.setLastProcessedBlock(event.blockNumber);

      logger.info('Withdrawal processed', { user: event.user });
    } catch (error) {
      logger.error('Failed to process withdrawal', {
        user: event.user,
        error: String(error),
      });
    }
  }

  /**
   * Handle MarketResolved event
   */
  private async handleMarketResolved(event: MarketResolvedEvent): Promise<void> {
    try {
      logger.info('Processing market resolution', {
        marketId: event.marketId,
        winningOutcome: event.winningOutcome,
      });

      // Settle all positions
      const results = await this.oracleClient.handleMarketResolution(event);

      // Prepare and submit batch balance update
      const update = await this.oracleClient.prepareBatchUpdate(results);

      if (update.users.length > 0) {
        await this.contractCaller.batchUpdateBalances(
          update.users,
          update.encryptedBalances,
          update.stateRoot
        );
      }

      // Commit new root
      const attestation = await this.keyManager.generateAttestation();
      await this.contractCaller.commitRoot(
        this.stateManager.getRoot(),
        event.marketId,
        attestation
      );

      await this.stateManager.setLastProcessedBlock(event.blockNumber);

      logger.info('Market resolution complete', {
        marketId: event.marketId,
        settledPositions: results.length,
      });
    } catch (error) {
      logger.error('Failed to process market resolution', {
        marketId: event.marketId,
        error: String(error),
      });
    }
  }

  /**
   * Start the TEE application
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('TEE application already running');
      return;
    }

    logger.info('Starting TEE application');

    // Recover state
    await this.recoveryManager.recover();

    // Get last processed block from state
    const lastBlock = await this.stateManager.getLastProcessedBlock();

    // Start event listener
    await this.eventListener.start(lastBlock);

    this.isRunning = true;
    this.mode = 'NORMAL';
    await this.stateManager.setMode('NORMAL');

    logger.info('TEE application started', {
      mode: this.mode,
      lastBlock: lastBlock.toString(),
    });
  }

  /**
   * Stop the TEE application
   */
  async stop(): Promise<void> {
    logger.info('Stopping TEE application');

    this.isRunning = false;
    this.eventListener.stop();
    this.providerManager.destroy();

    // Save final snapshot
    await this.stateManager.saveSnapshot();

    logger.info('TEE application stopped');
  }

  /**
   * Set TEE mode
   */
  async setMode(mode: TEEMode): Promise<void> {
    this.mode = mode;
    await this.stateManager.setMode(mode);
    logger.info('TEE mode changed', { mode });
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    mode: TEEMode;
    root: Hex;
    version: number;
    publicKey: Hex;
  } {
    return {
      isRunning: this.isRunning,
      mode: this.mode,
      root: this.stateManager.getRoot(),
      version: this.stateManager.getStateVersion(),
      publicKey: this.keyManager.getPublicKeyHex(),
    };
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const app = new TEEApplication();

  try {
    await app.initialize();
    await app.start();

    // Handle shutdown signals
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT');
      await app.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM');
      await app.stop();
      process.exit(0);
    });

    logger.info('TEE matching engine running');
  } catch (error) {
    logger.error('Fatal error', { error: String(error) });
    process.exit(1);
  }
}

// Run if this is the main module
main().catch(console.error);

export { TEEApplication };
