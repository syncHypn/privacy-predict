import { IExec, utils } from 'iexec';
import { createPublicClient, http } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { ADDRESSES } from './contracts/addresses';
import { MarketFactoryABI } from './contracts/abis/MarketFactory';
import { OrderQueueABI } from './contracts/abis/OrderQueue';

// ── Config ──

const IAPP_ADDRESS = '0x40b153D345C1590795741990AA826CB0D050acA5';
const FLUSH_INTERVAL_MS = 60_000; // 1 minute
const MIN_ORDERS_TO_FLUSH = 1;

// ── State ──

let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Tracks the order count at which we last triggered TEE per market */
const lastFlushedAt = new Map<string, number>();

// ── Public API ──

export function startFlushLoop() {
  if (running) return;
  running = true;
  console.log('[flush] Starting flush loop');
  scheduleNext();
}

export function stopFlushLoop() {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  console.log('[flush] Stopped flush loop');
}

// ── Internals ──

function scheduleNext() {
  if (!running) return;
  timer = setTimeout(async () => {
    try {
      await flushAll();
    } catch (err) {
      console.error('[flush] Unhandled error in flush cycle:', err);
    }
    scheduleNext();
  }, FLUSH_INTERVAL_MS);
}

async function flushAll() {
  const privateKey = process.env.FLUSH_WALLET_PRIVATE_KEY;
  if (!privateKey) {
    console.warn('[flush] FLUSH_WALLET_PRIVATE_KEY not set — skipping');
    return;
  }

  const viemClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(),
  });

  // 1. Get all market IDs from MarketFactory
  const marketCount = await viemClient.readContract({
    address: ADDRESSES.MarketFactory as `0x${string}`,
    abi: MarketFactoryABI,
    functionName: 'getMarketCount',
  });

  const count = Number(marketCount);
  if (count === 0) {
    console.log('[flush] No markets found');
    return;
  }

  // 2. For each market, check pending order count
  for (let i = 0; i < count; i++) {
    const marketId = await viemClient.readContract({
      address: ADDRESSES.MarketFactory as `0x${string}`,
      abi: MarketFactoryABI,
      functionName: 'getMarketIdAt',
      args: [BigInt(i)],
    });

    const orderCount = await viemClient.readContract({
      address: ADDRESSES.OrderQueue as `0x${string}`,
      abi: OrderQueueABI,
      functionName: 'getMarketOrderCount',
      args: [marketId],
    });

    const total = Number(orderCount);
    const lastFlushed = lastFlushedAt.get(marketId as string) ?? 0;
    const newOrders = total - lastFlushed;

    if (newOrders < MIN_ORDERS_TO_FLUSH) continue;

    console.log(
      `[flush] Market ${marketId} has ${newOrders} new order(s) (${total} total) — triggering TEE`
    );

    try {
      await triggerTEE(privateKey, marketId as string);
      lastFlushedAt.set(marketId as string, total);
    } catch (err) {
      console.error(`[flush] TEE trigger failed for market ${marketId}:`, err);
    }
  }
}

async function triggerTEE(privateKey: string, marketId: string) {
  const ethProvider = utils.getSignerFromPrivateKey(
    'https://api.zan.top/arb-sepolia',
    privateKey
  );
  const iexec = new IExec({ ethProvider });

  // Pre-flight: check workerpool availability
  const workerpoolOrderbook = await iexec.orderbook.fetchWorkerpoolOrderbook({
    category: 0,
    minTag: ['tee', 'scone'],
  });
  if (workerpoolOrderbook.orders.length === 0) {
    throw new Error('No workerpool orders available — pool is empty');
  }

  const workerpoolPrice = workerpoolOrderbook.orders[0].order.workerpoolprice;

  // Pre-flight: check RLC balance covers the workerpool price
  const balance = await iexec.account.checkBalance(await iexec.wallet.getAddress());
  const stake = BigInt(balance.stake.toString());
  const price = BigInt(workerpoolPrice.toString());
  if (stake < price) {
    throw new Error(
      `Insufficient RLC balance: have ${balance.stake} nRLC, need ${workerpoolPrice} nRLC. Deposit RLC to your iExec account first.`
    );
  }

  // 1. Create & sign app order
  const apporder = await iexec.order.createApporder({
    app: IAPP_ADDRESS,
    tag: ['tee', 'scone'],
  });
  const signedApporder = await iexec.order.signApporder(apporder);

  // 2. Create & sign request order WITH callback — PoCo hub delivers result on-chain
  const requestorder = await iexec.order.createRequestorder({
    app: IAPP_ADDRESS,
    category: 0,
    tag: ['tee', 'scone'],
    workerpoolmaxprice: workerpoolPrice,
    callback: ADDRESSES.CallbackReceiver,
    params: {
      iexec_args: `market=${marketId}`,
    },
  });
  const signedRequestorder = await iexec.order.signRequestorder(requestorder);

  // 3. Match orders → creates a deal
  const { dealid } = await iexec.order.matchOrders({
    apporder: signedApporder,
    workerpoolorder: workerpoolOrderbook.orders[0].order,
    requestorder: signedRequestorder,
  });
  console.log(`[flush] Deal created: ${dealid}`);

  // 4. Wait for task completion via obsTask observable
  const taskid = await iexec.deal.computeTaskId(dealid, 0);
  console.log(`[flush] Waiting for task ${taskid}…`);

  const task = await new Promise<{ statusName: string }>((resolve, reject) => {
    let lastTask: { statusName: string } | undefined;
    iexec.task.obsTask(taskid, { dealid }).then((obs) => {
      obs.subscribe({
        next: ({ task: t }) => {
          lastTask = t;
        },
        error: (e) => reject(e),
        complete: () => resolve(lastTask!),
      });
    });
  });

  console.log(`[flush] Task ${taskid} completed: ${task.statusName}`);
  // Done! The PoCo hub already called CallbackReceiver.receiveResult()
  // which committed the state root, stored prices, and updated balances on-chain.
}
