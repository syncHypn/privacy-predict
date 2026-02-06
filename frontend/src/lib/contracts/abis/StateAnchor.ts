export const StateAnchorABI = [
  {
    type: "function",
    name: "commitRoot",
    inputs: [
      { name: "newRoot", type: "bytes32", internalType: "bytes32" },
      { name: "matchId", type: "bytes32", internalType: "bytes32" },
      { name: "teeAttestation", type: "bytes", internalType: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "currentRoot",
    inputs: [],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "stateVersion",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getRootAtVersion",
    inputs: [{ name: "version", type: "uint256", internalType: "uint256" }],
    outputs: [{ name: "", type: "bytes32", internalType: "bytes32" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isRootCommitted",
    inputs: [{ name: "root", type: "bytes32", internalType: "bytes32" }],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "StateUpdated",
    inputs: [
      { name: "version", type: "uint256", indexed: true, internalType: "uint256" },
      { name: "newRoot", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "previousRoot", type: "bytes32", indexed: true, internalType: "bytes32" },
      { name: "matchId", type: "bytes32", indexed: false, internalType: "bytes32" },
    ],
  },
] as const;
