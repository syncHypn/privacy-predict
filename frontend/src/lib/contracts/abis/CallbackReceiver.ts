export const CallbackReceiverABI = [
  {
    type: "function",
    name: "getMarketPrices",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [
      { name: "yesPrice", type: "uint64" },
      { name: "noPrice", type: "uint64" },
      { name: "timestamp", type: "uint128" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "PricesUpdated",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "yesPrice", type: "uint64", indexed: false },
      { name: "noPrice", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CallbackReceived",
    inputs: [
      { name: "taskId", type: "bytes32", indexed: true },
      { name: "stateRoot", type: "bytes32", indexed: true },
      { name: "matchId", type: "bytes32", indexed: false },
    ],
  },
] as const;
