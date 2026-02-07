import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CONTRACTS = [
  {
    name: "MarketFactory",
    address: "0x6d46708ED27814028e20D93ef4E9971935b95061",
    description: "Creates and manages prediction markets",
  },
  {
    name: "OrderQueue",
    address: "0x1E6e8480B232EE254AA6DE85b48f9c9Db2BC431D",
    description: "Stores encrypted orders on-chain",
  },
  {
    name: "PrivateToken",
    address: "0x0a64514c7F71b64430D8AE2706ea029E211a4aA0",
    description: "Manages encrypted user balances and deposits",
  },
  {
    name: "StateAnchor",
    address: "0xB9410CC8ca7008DE2E1e1dB109aa44eE4638093C",
    description: "Anchors TEE state roots on-chain for verifiability",
  },
  {
    name: "CallbackReceiver",
    address: "0x669F795aB00aAE89A22Abb5BbCB366FB65B3ab5E",
    description: "Receives results from the TEE via iExec callback",
  },
];

const EXPLORER = "https://sepolia.arbiscan.io/address";

export default function DocsPage() {
  return (
    <div className="space-y-10">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          How iPred Works
        </h1>
        <p className="mt-1 text-muted-foreground">
          A high-level overview of the architecture behind confidential
          prediction markets.
        </p>
      </div>

      {/* Overview */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Overview</h2>
        <Card className="border-border bg-card">
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <p>
              iPred is a <strong className="text-foreground">confidential prediction market</strong> built
              on Arbitrum Sepolia. Unlike traditional prediction markets where
              everyone can see what you&apos;re trading, iPred encrypts your
              orders before they hit the blockchain. A Trusted Execution
              Environment (TEE) powered by iExec then matches orders privately
              and publishes only the resulting prices — never individual
              positions.
            </p>
            <p className="mt-3">
              The system is composed of five layers that work together:
              smart contracts, a TEE matching engine, an on-chain indexer,
              a database, and this web application.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Architecture Diagram (text-based) */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Architecture
        </h2>
        <Card className="border-border bg-card overflow-x-auto">
          <CardContent className="pt-6">
            <pre className="text-xs leading-relaxed text-muted-foreground font-mono whitespace-pre">
{`
  ┌─────────────┐         ┌───────────────────┐
  │   Web App   │────────▶│  Next.js API       │
  │  (Browser)  │◀────────│  Routes            │
  └──────┬──────┘         └────────┬───────────┘
         │                         │
         │  submit encrypted       │  read indexed
         │  orders / deposits      │  events
         ▼                         ▼
  ┌─────────────────────────────────────────────┐
  │           Arbitrum Sepolia (L2)              │
  │                                             │
  │  MarketFactory · OrderQueue · PrivateToken  │
  │          StateAnchor · CallbackReceiver     │
  └──────────────────┬──────────────────────────┘
         │                         │
         │  events                 │  callback
         ▼                         │
  ┌──────────────┐          ┌──────┴──────┐
  │   Goldsky    │          │   iExec     │
  │   Indexer    │          │   TEE       │
  └──────┬───────┘          │  (matcher)  │
         │                  └─────────────┘
         ▼
  ┌──────────────┐
  │  PostgreSQL  │
  │   (Neon)     │
  └──────────────┘
`}
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* Smart Contracts */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Smart Contracts
        </h2>
        <Card className="border-border bg-card">
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <p>
              The on-chain layer lives on <strong className="text-foreground">Arbitrum Sepolia</strong> and
              handles everything that needs to be publicly verifiable: creating
              markets, accepting encrypted orders, holding user deposits, and
              anchoring state roots published by the TEE.
            </p>
            <p className="mt-3">
              Importantly, user balances and order contents are{" "}
              <strong className="text-foreground">never visible on-chain in plaintext</strong>. Orders
              are encrypted client-side with the TEE&apos;s public key before
              submission, and balances are stored as encrypted blobs that only
              the TEE can read.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONTRACTS.map((c) => (
            <Card key={c.name} className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-foreground">
                  {c.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {c.description}
                </p>
                <a
                  href={`${EXPLORER}/${c.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block font-mono text-[10px] text-primary hover:underline"
                >
                  {c.address.slice(0, 8)}...{c.address.slice(-6)}
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* TEE */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          TEE Matching Engine (iExec)
        </h2>
        <Card className="border-border bg-card">
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <p>
              The core of iPred&apos;s privacy guarantee is the{" "}
              <strong className="text-foreground">
                Trusted Execution Environment (TEE)
              </strong>
              , powered by iExec. The TEE runs inside a secure hardware enclave
              that even the server operator cannot peek into.
            </p>

            <h3 className="mt-5 mb-2 text-sm font-semibold text-foreground">
              What it does
            </h3>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Reads encrypted orders and deposits directly from the blockchain
              </li>
              <li>
                Decrypts them using a sealed key that only exists inside the
                enclave
              </li>
              <li>
                Runs a constant-product AMM (similar to Uniswap) to match
                trades across YES/NO outcome pools
              </li>
              <li>
                Publishes updated prices as <strong className="text-foreground">public state</strong> (everyone
                can see market prices)
              </li>
              <li>
                Encrypts updated user balances as{" "}
                <strong className="text-foreground">private state</strong> (only the TEE can read)
              </li>
              <li>
                Commits a state root back on-chain via iExec&apos;s callback
                mechanism
              </li>
            </ol>

            <h3 className="mt-5 mb-2 text-sm font-semibold text-foreground">
              Deterministic replay
            </h3>
            <p>
              Every time the TEE runs, it replays the full history of deposits
              and orders from the genesis block. This makes execution fully
              deterministic — any TEE instance processing the same chain data
              will produce the exact same result, which is key for
              verifiability.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Indexer */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Indexer (Goldsky)
        </h2>
        <Card className="border-border bg-card">
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <p>
              Reading events directly from the blockchain is slow and
              expensive. iPred uses{" "}
              <strong className="text-foreground">Goldsky</strong>, a real-time
              blockchain indexer, to decode on-chain events and stream them into
              a database.
            </p>

            <h3 className="mt-5 mb-2 text-sm font-semibold text-foreground">
              Indexed events
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>Market creation and resolution</li>
              <li>Order submissions and cancellations</li>
              <li>Deposits, withdrawal requests, and processed withdrawals</li>
              <li>State updates from the TEE</li>
              <li>Price updates from TEE callbacks</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Database */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Database (Neon PostgreSQL)
        </h2>
        <Card className="border-border bg-card">
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <p>
              Goldsky writes decoded events into a{" "}
              <strong className="text-foreground">Neon PostgreSQL</strong>{" "}
              serverless database. This gives the web app fast, queryable access
              to all historical and real-time market data without hitting the
              blockchain directly.
            </p>
            <p className="mt-3">
              The database stores market metadata, order history, deposit
              records, price snapshots, and aggregate statistics — all derived
              from on-chain events. It does <em>not</em> store any private data
              like decrypted balances or order contents.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Web App */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Web Application
        </h2>
        <Card className="border-border bg-card">
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <p>
              The frontend is a{" "}
              <strong className="text-foreground">Next.js</strong> application
              that ties everything together. It reads market data from the
              database via API routes, lets users connect their wallet via
              Privy, and submits encrypted transactions to the smart contracts.
            </p>

            <h3 className="mt-5 mb-2 text-sm font-semibold text-foreground">
              Key user flows
            </h3>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong className="text-foreground">Browse markets</strong> — see live prices, volume, and
                outcomes
              </li>
              <li>
                <strong className="text-foreground">Deposit collateral</strong> — send USDC to the
                PrivateToken contract, which encrypts your balance
              </li>
              <li>
                <strong className="text-foreground">Place an order</strong> — your order is encrypted
                client-side with the TEE&apos;s public key, then submitted to
                the OrderQueue contract
              </li>
              <li>
                <strong className="text-foreground">View activity</strong> — see encrypted orders flowing
                through the system in real time
              </li>
              <li>
                <strong className="text-foreground">Track portfolio</strong> — view your encrypted
                positions and order history
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* End-to-end flow */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          End-to-End: Life of a Trade
        </h2>
        <Card className="border-border bg-card">
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                <strong className="text-foreground">Deposit</strong> — You deposit
                USDC into the PrivateToken contract. Your balance is encrypted
                on-chain.
              </li>
              <li>
                <strong className="text-foreground">Order</strong> — You pick an
                outcome (e.g. &quot;YES&quot; on &quot;Will BTC hit 100k?&quot;)
                and an amount. The webapp encrypts your order with the
                TEE&apos;s public key and submits it to OrderQueue.
              </li>
              <li>
                <strong className="text-foreground">Indexing</strong> — Goldsky
                picks up the on-chain events and writes them to PostgreSQL. The
                webapp shows your order as &quot;Encrypted&quot; in the activity
                feed.
              </li>
              <li>
                <strong className="text-foreground">TEE execution</strong> — The
                iExec TEE is triggered. It reads all deposits and orders from
                the chain, decrypts them inside the enclave, and runs the AMM.
              </li>
              <li>
                <strong className="text-foreground">State update</strong> — The
                TEE publishes new prices (public) and updated encrypted balances
                (private). A state root is committed on-chain via the
                CallbackReceiver.
              </li>
              <li>
                <strong className="text-foreground">Result</strong> — The webapp
                picks up the new prices from the indexer and updates the
                charts. Your position is reflected in your encrypted portfolio.
              </li>
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Privacy guarantees */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">
          Privacy Guarantees
        </h2>
        <Card className="border-border bg-card">
          <CardContent className="pt-6 text-sm leading-relaxed text-muted-foreground">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <h3 className="mb-1 text-sm font-semibold text-primary">
                  Private
                </h3>
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  <li>Your order side (BUY/SELL) and amount</li>
                  <li>Your individual balances and positions</li>
                  <li>Which outcome you chose</li>
                </ul>
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-4">
                <h3 className="mb-1 text-sm font-semibold text-foreground">
                  Public
                </h3>
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  <li>That you submitted an order (visible as encrypted blob)</li>
                  <li>Market prices after each matching round</li>
                  <li>Total market volume and number of traders</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
