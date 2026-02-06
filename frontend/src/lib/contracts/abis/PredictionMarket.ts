export const PredictionMarketABI = [
  {
    type: "function",
    name: "getTEEPublicKey",
    inputs: [],
    outputs: [{ name: "publicKey", type: "bytes", internalType: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getIndicativePrice",
    inputs: [
      { name: "marketId", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [
      { name: "priceYes", type: "uint256", internalType: "uint256" },
      { name: "priceNo", type: "uint256", internalType: "uint256" },
      { name: "lastUpdate", type: "uint256", internalType: "uint256" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "buy",
    inputs: [
      { name: "marketId", type: "bytes32", internalType: "bytes32" },
      { name: "isYes", type: "bool", internalType: "bool" },
      { name: "encryptedAmount", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "sell",
    inputs: [
      { name: "marketId", type: "bytes32", internalType: "bytes32" },
      { name: "isYes", type: "bool", internalType: "bool" },
      { name: "encryptedAmount", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "redeem",
    inputs: [
      { name: "marketId", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "poolExists",
    inputs: [
      { name: "marketId", type: "bytes32", internalType: "bytes32" },
    ],
    outputs: [{ name: "exists", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
] as const;
