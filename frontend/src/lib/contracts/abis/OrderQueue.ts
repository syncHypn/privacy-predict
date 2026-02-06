export const OrderQueueABI = [
  {
    type: "function",
    name: "submitOrder",
    inputs: [
      { name: "marketId", type: "bytes32", internalType: "bytes32" },
      { name: "encryptedPayload", type: "bytes", internalType: "bytes" },
    ],
    outputs: [{ name: "orderId", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "cancelOrder",
    inputs: [{ name: "orderId", type: "bytes32", internalType: "bytes32" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getOrder",
    inputs: [{ name: "orderId", type: "bytes32", internalType: "bytes32" }],
    outputs: [
      {
        name: "order",
        type: "tuple",
        internalType: "struct IOrderQueue.EncryptedOrder",
        components: [
          { name: "orderId", type: "bytes32", internalType: "bytes32" },
          { name: "marketId", type: "bytes32", internalType: "bytes32" },
          { name: "user", type: "address", internalType: "address" },
          { name: "encryptedPayload", type: "bytes", internalType: "bytes" },
          { name: "timestamp", type: "uint256", internalType: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getUserOrders",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [{ name: "orderIds", type: "bytes32[]", internalType: "bytes32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMarketOrders",
    inputs: [{ name: "marketId", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "orderIds", type: "bytes32[]", internalType: "bytes32[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isOrderCancelled",
    inputs: [{ name: "orderId", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getUserOrderCount",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [{ name: "count", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getMarketOrderCount",
    inputs: [{ name: "marketId", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "count", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "OrderSubmitted",
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "marketId", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "user", type: "address", indexed: true, internalType: "address" },
      { name: "encryptedPayload", type: "bytes", indexed: false, internalType: "bytes" },
      { name: "timestamp", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
  {
    type: "event",
    name: "OrderCancelled",
    inputs: [
      { name: "orderId", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "user", type: "address", indexed: true, internalType: "address" },
    ],
  },
] as const;
