import { NextRequest, NextResponse } from 'next/server';
import { IExec, utils } from 'iexec';
import JSZip from 'jszip';

const IAPP_ADDRESS = '0xd9735E83383E5aeDC236Fb9697793baBF34868bC';

export async function POST(req: NextRequest) {
  try {
    const { userAddress, signature, userNaclPubkey } = await req.json();

    if (!userAddress || !signature || !userNaclPubkey) {
      return NextResponse.json(
        { error: 'userAddress, signature, and userNaclPubkey are required' },
        { status: 400 }
      );
    }

    const privateKey = process.env.FLUSH_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { error: 'Server not configured for balance queries' },
        { status: 503 }
      );
    }

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
      return NextResponse.json(
        { error: 'No workerpool orders available — pool is empty' },
        { status: 503 }
      );
    }

    const workerpoolPrice = workerpoolOrderbook.orders[0].order.workerpoolprice;

    // Pre-flight: check RLC balance
    const balance = await iexec.account.checkBalance(await iexec.wallet.getAddress());
    const stake = BigInt(balance.stake.toString());
    const price = BigInt(workerpoolPrice.toString());
    if (stake < price) {
      return NextResponse.json(
        {
          error: `Insufficient RLC balance: have ${balance.stake} nRLC, need ${workerpoolPrice} nRLC`,
        },
        { status: 503 }
      );
    }

    // 1. Create & sign app order
    const apporder = await iexec.order.createApporder({
      app: IAPP_ADDRESS,
      tag: ['tee', 'scone'],
    });
    const signedApporder = await iexec.order.signApporder(apporder);

    // 2. Create request order with balance query args
    const iexecArgs = `balance ${userAddress} ${signature} ${userNaclPubkey}`;
    const requestorder = await iexec.order.createRequestorder({
      app: IAPP_ADDRESS,
      category: 0,
      tag: ['tee', 'scone'],
      workerpoolmaxprice: workerpoolPrice,
      params: {
        iexec_args: iexecArgs,
      },
    });
    const signedRequestorder = await iexec.order.signRequestorder(requestorder);

    // 3. Match orders
    const { dealid } = await iexec.order.matchOrders({
      apporder: signedApporder,
      workerpoolorder: workerpoolOrderbook.orders[0].order,
      requestorder: signedRequestorder,
    });

    const taskid = await iexec.deal.computeTaskId(dealid, 0);
    console.log(`[balance-query] Deal ${dealid}, Task ${taskid}`);

    // 5. Wait for task completion
    const task = await new Promise<{ statusName: string; results?: unknown }>(
      (resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Task timeout')),
          5 * 60 * 1000
        );

        let lastTask: { statusName: string; results?: unknown } | undefined;
        iexec.task.obsTask(taskid, { dealid }).then((obs) => {
          obs.subscribe({
            next: ({ task: t }) => {
              lastTask = t;
            },
            error: (e) => {
              clearTimeout(timeout);
              reject(e);
            },
            complete: () => {
              clearTimeout(timeout);
              resolve(lastTask!);
            },
          });
        });
      }
    );

    if (task.statusName !== 'COMPLETED') {
      return NextResponse.json(
        { error: `Task failed with status: ${task.statusName}` },
        { status: 500 }
      );
    }

    // 6. Fetch result (returned as a ZIP archive)
    const resultBlob = await iexec.task.fetchResults(taskid);
    const arrayBuffer = await (resultBlob as unknown as Response).arrayBuffer();

    const zip = await JSZip.loadAsync(arrayBuffer);
    const resultFile = zip.file('result.json');
    if (!resultFile) {
      // List files in zip for debugging
      const files = Object.keys(zip.files);
      console.error('[balance-query] result.json not found in ZIP. Files:', files);
      return NextResponse.json(
        { error: 'result.json not found in task output', files },
        { status: 500 }
      );
    }

    const resultText = await resultFile.async('text');
    const resultData = JSON.parse(resultText);

    return NextResponse.json(resultData);
  } catch (err) {
    console.error('POST /api/balance-query error:', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
