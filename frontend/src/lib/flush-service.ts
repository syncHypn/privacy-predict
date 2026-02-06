import { IExec, utils } from 'iexec';
import JSZip from 'jszip';
import { createPublicClient, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';
import { ADDRESSES } from './contracts/addresses';
import { MarketFactoryABI } from './contracts/abis/MarketFactory';
import { OrderQueueABI } from './contracts/abis/OrderQueue';
import { StateAnchorABI } from './contracts/abis/StateAnchor';
import { insertPriceSnapshot } from './services/price.service';

// ── Config ──

const IAPP_ADDRESS = '0xd9735E83383E5aeDC236Fb9697793baBF34868bC';
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

  // 2. Create & sign request order (NO callback — results go to IPFS)
  const requestorder = await iexec.order.createRequestorder({
    app: IAPP_ADDRESS,
    category: 0,
    tag: ['tee', 'scone'],
    workerpoolmaxprice: workerpoolPrice,
    params: {
      iexec_args: marketId,
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
  if (task.statusName !== 'COMPLETED') return;

  // 5. Fetch result ZIP from IPFS
  console.log(`[flush] Fetching results from IPFS…`);
  const resultBlob = await iexec.task.fetchResults(taskid);
  const arrayBuffer = await (resultBlob as unknown as Response).arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const zipFiles = Object.keys(zip.files);
  console.log(`[flush] ZIP contents: ${zipFiles.join(', ')}`);

  // 6. Extract result.json → prices
  const resultFile = zip.file('result.json');
  if (!resultFile) {
    console.error('[flush] result.json not found in ZIP');
    return;
  }

  const resultText = await resultFile.async('text');
  const resultData = JSON.parse(resultText);
  console.log(`[flush] result.json:`, JSON.stringify(resultData, null, 2));

  if (!resultData.success) {
    console.error('[flush] TEE execution failed:', resultData.error);
    return;
  }

  // 7. Store prices in DB
  if (resultData.prices) {
    const yesPrice = Math.round(resultData.prices.yes * 10000);
    const noPrice = Math.round(resultData.prices.no * 10000);
    await insertPriceSnapshot(marketId, yesPrice, noPrice);
    console.log(`[flush] Price snapshot stored: YES=${yesPrice} NO=${noPrice}`);
  }

  // 8. Extract callback data and commit state root on-chain
  const callbackFile = zip.file('callback-data.json');
  if (callbackFile && resultData.stateRoot) {
    const callbackText = await callbackFile.async('text');
    const callbackData = JSON.parse(callbackText);
    console.log(`[flush] Callback data: stateRoot=${resultData.stateRoot}, matchId=${callbackData.matchId}`);

    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: arbitrumSepolia,
        transport: http(),
      });

      const attestation = new TextEncoder().encode(callbackData.attestation || 'RELAYER_ATTESTATION');

      const txHash = await walletClient.writeContract({
        address: ADDRESSES.StateAnchor as `0x${string}`,
        abi: StateAnchorABI,
        functionName: 'commitRoot',
        args: [
          resultData.stateRoot as `0x${string}`,
          (callbackData.matchId || `0x${Date.now().toString(16).padStart(64, '0')}`) as `0x${string}`,
          `0x${Buffer.from(attestation).toString('hex')}` as `0x${string}`,
        ],
      });
      console.log(`[flush] State root committed on-chain: ${txHash}`);
    } catch (err) {
      console.error('[flush] Failed to commit state root on-chain:', err);
    }
  }
}
