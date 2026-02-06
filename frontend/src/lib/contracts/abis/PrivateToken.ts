export const PrivateTokenABI = [
  {
    type: "function",
    name: "deposit",
    inputs: [{ name: "amount", type: "uint256", internalType: "uint256" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "requestWithdrawal",
    inputs: [
      { name: "commitmentHash", type: "bytes32", internalType: "bytes32" },
      { name: "encryptedAmount", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getEncryptedBalance",
    inputs: [{ name: "user", type: "address", internalType: "address" }],
    outputs: [{ name: "", type: "bytes", internalType: "bytes" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "collateralToken",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "address" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Deposit",
    inputs: [
      { name: "user", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
      { name: "commitment", type: "bytes32", indexed: true, internalType: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "WithdrawalRequested",
    inputs: [
      { name: "user", type: "address", indexed: true, internalType: "address" },
      { name: "commitmentHash", type: "bytes32", indexed: true, internalType: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "WithdrawalProcessed",
    inputs: [
      { name: "user", type: "address", indexed: true, internalType: "address" },
      { name: "amount", type: "uint256", indexed: false, internalType: "uint256" },
    ],
  },
] as const;
