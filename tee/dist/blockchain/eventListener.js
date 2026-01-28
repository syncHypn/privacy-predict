/**
 * Event Listener
 *
 * Polls blockchain for events from:
 * - OrderQueue: OrderSubmitted, OrderCancelled
 * - PrivateToken: Deposit, WithdrawalRequested
 * - MarketFactory: MarketResolved
 */
import { parseAbiItem } from 'viem';
import { createLogger } from '../utils/logger.js';
const logger = createLogger('EventListener');
// ABI fragments for event parsing
const ORDER_SUBMITTED_ABI = parseAbiItem('event OrderSubmitted(bytes32 indexed orderId, bytes32 indexed marketId, address indexed user, bytes encryptedPayload, uint256 timestamp)');
const ORDER_CANCELLED_ABI = parseAbiItem('event OrderCancelled(bytes32 indexed orderId, address indexed user)');
const DEPOSIT_ABI = parseAbiItem('event Deposit(address indexed user, uint256 amount, bytes32 indexed commitment)');
const WITHDRAWAL_REQUESTED_ABI = parseAbiItem('event WithdrawalRequested(address indexed user, bytes32 indexed commitmentHash)');
const MARKET_RESOLVED_ABI = parseAbiItem('event MarketResolved(bytes32 indexed marketId, uint8 winningOutcome)');
/**
 * Event Listener class
 */
export class EventListener {
    providerManager;
    contracts;
    pollingInterval;
    lastProcessedBlock = 0n;
    isRunning = false;
    pollTimer;
    handlers = {};
    constructor(providerManager, contracts, pollingInterval = 3000) {
        this.providerManager = providerManager;
        this.contracts = contracts;
        this.pollingInterval = pollingInterval;
    }
    /**
     * Register event handlers
     */
    onOrderSubmitted(handler) {
        this.handlers.onOrderSubmitted = handler;
    }
    onOrderCancelled(handler) {
        this.handlers.onOrderCancelled = handler;
    }
    onDeposit(handler) {
        this.handlers.onDeposit = handler;
    }
    onWithdrawalRequested(handler) {
        this.handlers.onWithdrawalRequested = handler;
    }
    onMarketResolved(handler) {
        this.handlers.onMarketResolved = handler;
    }
    /**
     * Start listening for events
     */
    async start(fromBlock) {
        if (this.isRunning) {
            logger.warn('Event listener already running');
            return;
        }
        // Get starting block
        if (fromBlock !== undefined) {
            this.lastProcessedBlock = fromBlock;
        }
        else {
            // Start from current block
            const client = this.providerManager.getPublicClient();
            this.lastProcessedBlock = await client.getBlockNumber();
        }
        this.isRunning = true;
        logger.info('Starting event listener', {
            fromBlock: this.lastProcessedBlock.toString(),
        });
        // Start polling loop
        this.poll();
    }
    /**
     * Stop listening
     */
    stop() {
        this.isRunning = false;
        if (this.pollTimer) {
            clearTimeout(this.pollTimer);
            this.pollTimer = undefined;
        }
        logger.info('Event listener stopped');
    }
    /**
     * Poll for new events
     */
    poll() {
        if (!this.isRunning)
            return;
        void this.processNewBlocks()
            .catch(error => {
            logger.error('Error processing blocks', { error: String(error) });
        })
            .finally(() => {
            if (this.isRunning) {
                this.pollTimer = setTimeout(() => this.poll(), this.pollingInterval);
            }
        });
    }
    /**
     * Process new blocks for events
     */
    async processNewBlocks() {
        const client = this.providerManager.getPublicClient();
        const currentBlock = await client.getBlockNumber();
        if (currentBlock <= this.lastProcessedBlock) {
            return;
        }
        const fromBlock = this.lastProcessedBlock + 1n;
        const toBlock = currentBlock;
        logger.debug('Processing blocks', {
            from: fromBlock.toString(),
            to: toBlock.toString(),
        });
        // Fetch and process events in parallel
        await Promise.all([
            this.fetchOrderSubmittedEvents(fromBlock, toBlock),
            this.fetchOrderCancelledEvents(fromBlock, toBlock),
            this.fetchDepositEvents(fromBlock, toBlock),
            this.fetchWithdrawalRequestedEvents(fromBlock, toBlock),
            this.fetchMarketResolvedEvents(fromBlock, toBlock),
        ]);
        this.lastProcessedBlock = toBlock;
    }
    /**
     * Fetch OrderSubmitted events
     */
    async fetchOrderSubmittedEvents(fromBlock, toBlock) {
        if (!this.handlers.onOrderSubmitted)
            return;
        try {
            const client = this.providerManager.getPublicClient();
            const logs = await client.getLogs({
                address: this.contracts.orderQueue,
                event: ORDER_SUBMITTED_ABI,
                fromBlock,
                toBlock,
            });
            for (const log of logs) {
                const event = this.parseOrderSubmittedLog(log);
                if (event) {
                    await this.handlers.onOrderSubmitted(event);
                }
            }
        }
        catch (error) {
            logger.error('Error fetching OrderSubmitted events', { error: String(error) });
        }
    }
    /**
     * Parse OrderSubmitted log
     */
    parseOrderSubmittedLog(log) {
        try {
            const topics = log.topics;
            const orderId = topics[1];
            const marketId = topics[2];
            const user = `0x${topics[3]?.slice(26)}`;
            // Decode data (encryptedPayload and timestamp)
            // encryptedPayload is dynamic bytes, timestamp is uint256
            const data = log.data;
            // Parse ABI-encoded data
            // First 32 bytes: offset to encryptedPayload (should be 0x40 = 64)
            // Next 32 bytes: timestamp
            // Then: length of encryptedPayload (32 bytes) + encryptedPayload
            const timestampHex = data.slice(66, 130); // bytes 32-64
            const timestamp = BigInt('0x' + timestampHex);
            // Get payload length and payload
            const payloadLengthHex = data.slice(130, 194);
            const payloadLength = parseInt(payloadLengthHex, 16);
            const encryptedPayload = ('0x' + data.slice(194, 194 + payloadLength * 2));
            if (!orderId || !marketId)
                return null;
            return {
                orderId,
                marketId,
                user,
                encryptedPayload,
                timestamp,
                blockNumber: log.blockNumber ?? 0n,
                transactionHash: log.transactionHash ?? '0x',
            };
        }
        catch (error) {
            logger.error('Error parsing OrderSubmitted log', { error: String(error) });
            return null;
        }
    }
    /**
     * Fetch OrderCancelled events
     */
    async fetchOrderCancelledEvents(fromBlock, toBlock) {
        if (!this.handlers.onOrderCancelled)
            return;
        try {
            const client = this.providerManager.getPublicClient();
            const logs = await client.getLogs({
                address: this.contracts.orderQueue,
                event: ORDER_CANCELLED_ABI,
                fromBlock,
                toBlock,
            });
            for (const log of logs) {
                const event = this.parseOrderCancelledLog(log);
                if (event) {
                    await this.handlers.onOrderCancelled(event);
                }
            }
        }
        catch (error) {
            logger.error('Error fetching OrderCancelled events', { error: String(error) });
        }
    }
    /**
     * Parse OrderCancelled log
     */
    parseOrderCancelledLog(log) {
        try {
            const topics = log.topics;
            const orderId = topics[1];
            const user = `0x${topics[2]?.slice(26)}`;
            if (!orderId)
                return null;
            return {
                orderId,
                user,
                blockNumber: log.blockNumber ?? 0n,
                transactionHash: log.transactionHash ?? '0x',
            };
        }
        catch (error) {
            logger.error('Error parsing OrderCancelled log', { error: String(error) });
            return null;
        }
    }
    /**
     * Fetch Deposit events
     */
    async fetchDepositEvents(fromBlock, toBlock) {
        if (!this.handlers.onDeposit)
            return;
        try {
            const client = this.providerManager.getPublicClient();
            const logs = await client.getLogs({
                address: this.contracts.privateToken,
                event: DEPOSIT_ABI,
                fromBlock,
                toBlock,
            });
            for (const log of logs) {
                const event = this.parseDepositLog(log);
                if (event) {
                    await this.handlers.onDeposit(event);
                }
            }
        }
        catch (error) {
            logger.error('Error fetching Deposit events', { error: String(error) });
        }
    }
    /**
     * Parse Deposit log
     */
    parseDepositLog(log) {
        try {
            const topics = log.topics;
            const user = `0x${topics[1]?.slice(26)}`;
            const commitment = topics[2];
            // amount is in data
            const amount = BigInt(log.data);
            if (!commitment)
                return null;
            return {
                user,
                amount,
                commitment,
                blockNumber: log.blockNumber ?? 0n,
                transactionHash: log.transactionHash ?? '0x',
            };
        }
        catch (error) {
            logger.error('Error parsing Deposit log', { error: String(error) });
            return null;
        }
    }
    /**
     * Fetch WithdrawalRequested events
     */
    async fetchWithdrawalRequestedEvents(fromBlock, toBlock) {
        if (!this.handlers.onWithdrawalRequested)
            return;
        try {
            const client = this.providerManager.getPublicClient();
            const logs = await client.getLogs({
                address: this.contracts.privateToken,
                event: WITHDRAWAL_REQUESTED_ABI,
                fromBlock,
                toBlock,
            });
            for (const log of logs) {
                const event = this.parseWithdrawalRequestedLog(log);
                if (event) {
                    await this.handlers.onWithdrawalRequested(event);
                }
            }
        }
        catch (error) {
            logger.error('Error fetching WithdrawalRequested events', { error: String(error) });
        }
    }
    /**
     * Parse WithdrawalRequested log
     */
    parseWithdrawalRequestedLog(log) {
        try {
            const topics = log.topics;
            const user = `0x${topics[1]?.slice(26)}`;
            const commitmentHash = topics[2];
            if (!commitmentHash)
                return null;
            return {
                user,
                commitmentHash,
                blockNumber: log.blockNumber ?? 0n,
                transactionHash: log.transactionHash ?? '0x',
            };
        }
        catch (error) {
            logger.error('Error parsing WithdrawalRequested log', { error: String(error) });
            return null;
        }
    }
    /**
     * Fetch MarketResolved events
     */
    async fetchMarketResolvedEvents(fromBlock, toBlock) {
        if (!this.handlers.onMarketResolved)
            return;
        try {
            const client = this.providerManager.getPublicClient();
            const logs = await client.getLogs({
                address: this.contracts.marketFactory,
                event: MARKET_RESOLVED_ABI,
                fromBlock,
                toBlock,
            });
            for (const log of logs) {
                const event = this.parseMarketResolvedLog(log);
                if (event) {
                    await this.handlers.onMarketResolved(event);
                }
            }
        }
        catch (error) {
            logger.error('Error fetching MarketResolved events', { error: String(error) });
        }
    }
    /**
     * Parse MarketResolved log
     */
    parseMarketResolvedLog(log) {
        try {
            const topics = log.topics;
            const marketId = topics[1];
            // winningOutcome is in data (uint8)
            const winningOutcome = parseInt(log.data.slice(0, 66), 16);
            if (!marketId)
                return null;
            return {
                marketId,
                winningOutcome,
                blockNumber: log.blockNumber ?? 0n,
                transactionHash: log.transactionHash ?? '0x',
            };
        }
        catch (error) {
            logger.error('Error parsing MarketResolved log', { error: String(error) });
            return null;
        }
    }
    /**
     * Sync from a specific block (for recovery)
     */
    async syncFromBlock(fromBlock) {
        const client = this.providerManager.getPublicClient();
        const currentBlock = await client.getBlockNumber();
        logger.info('Syncing from block', {
            from: fromBlock.toString(),
            to: currentBlock.toString(),
        });
        // Process in batches to avoid RPC limits
        const batchSize = 1000n;
        let from = fromBlock;
        while (from <= currentBlock) {
            const to = from + batchSize > currentBlock ? currentBlock : from + batchSize;
            await Promise.all([
                this.fetchOrderSubmittedEvents(from, to),
                this.fetchOrderCancelledEvents(from, to),
                this.fetchDepositEvents(from, to),
                this.fetchWithdrawalRequestedEvents(from, to),
                this.fetchMarketResolvedEvents(from, to),
            ]);
            from = to + 1n;
        }
        this.lastProcessedBlock = currentBlock;
        logger.info('Sync complete', { lastBlock: currentBlock.toString() });
    }
    /**
     * Get last processed block
     */
    getLastProcessedBlock() {
        return this.lastProcessedBlock;
    }
    /**
     * Set last processed block
     */
    setLastProcessedBlock(block) {
        this.lastProcessedBlock = block;
    }
    /**
     * Check if running
     */
    isListening() {
        return this.isRunning;
    }
}
/**
 * Create an event listener instance
 */
export function createEventListener(providerManager, contracts, pollingInterval) {
    return new EventListener(providerManager, contracts, pollingInterval);
}
//# sourceMappingURL=eventListener.js.map