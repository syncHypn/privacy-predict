import { NextRequest, NextResponse } from "next/server";
import { IExec, utils } from "iexec";

const IAPP_ADDRESS = "0x27c122b98EF9e8Ec3ea0CF1AaD1b7dbb22949F6C";

export async function POST(req: NextRequest) {
  try {
    const { userAddress, signature, userNaclPubkey } = await req.json();

    if (!userAddress || !signature || !userNaclPubkey) {
      return NextResponse.json(
        { error: "userAddress, signature, and userNaclPubkey are required" },
        { status: 400 }
      );
    }

    const privateKey = process.env.FLUSH_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json(
        { error: "Server not configured for balance queries" },
        { status: 503 }
      );
    }

    const ethProvider = utils.getSignerFromPrivateKey(
      "https://bellecour.iex.ec",
      privateKey
    );
    const iexec = new IExec({ ethProvider });

    // 1. Create & sign app order
    const apporder = await iexec.order.createApporder({
      app: IAPP_ADDRESS,
      tag: ["tee", "scone"],
    });
    const signedApporder = await iexec.order.signApporder(apporder);

    // 2. Fetch best workerpool order
    const workerpoolOrderbook =
      await iexec.orderbook.fetchWorkerpoolOrderbook({
        category: 0,
        minTag: ["tee", "scone"],
      });
    if (workerpoolOrderbook.orders.length === 0) {
      return NextResponse.json(
        { error: "No workerpool orders available" },
        { status: 503 }
      );
    }

    // 3. Create request order with balance query args
    const iexecArgs = `balance ${userAddress} ${signature} ${userNaclPubkey}`;
    const requestorder = await iexec.order.createRequestorder({
      app: IAPP_ADDRESS,
      category: 0,
      tag: ["tee", "scone"],
      params: {
        iexec_args: iexecArgs,
      },
    });
    const signedRequestorder =
      await iexec.order.signRequestorder(requestorder);

    // 4. Match orders
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
          () => reject(new Error("Task timeout")),
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

    if (task.statusName !== "COMPLETED") {
      return NextResponse.json(
        { error: `Task failed with status: ${task.statusName}` },
        { status: 500 }
      );
    }

    // 6. Fetch result
    const resultBlob = await iexec.task.fetchResults(taskid);
    const resultText = await (resultBlob as unknown as Response).text();

    // The result could be a zip or raw JSON depending on iExec config.
    // Try parsing as JSON directly first.
    let resultData;
    try {
      resultData = JSON.parse(resultText);
    } catch {
      // If it's a zip archive, the result is embedded differently.
      // For the hackathon, return the raw text and handle on frontend.
      resultData = { raw: resultText };
    }

    return NextResponse.json(resultData);
  } catch (err) {
    console.error("POST /api/balance-query error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
