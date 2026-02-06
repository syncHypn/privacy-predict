TEE iApp Architecture Summary
Batch Processing Approach
Per iExec docs, batch processing is achieved via:

Input files - Pass array of order URLs via iexec_input_files or inputFiles
Args - Pass batch parameters as command-line arguments
Protected data - Store encrypted state as protected data
The iApp can process multiple orders in one execution by reading from input files.

State Persistence (Arweave)

import Arweave from 'arweave';

const arweave = Arweave.init({
host: 'arweave.net',
port: 443,
protocol: 'https'
});

// Upload encrypted state
const tx = await arweave.createTransaction({ data: encryptedState }, wallet);
tx.addTag('Content-Type', 'application/octet-stream');
tx.addTag('App', 'iPred-TEE');
tx.addTag('Version', '1');
await arweave.transactions.sign(tx, wallet);
await arweave.transactions.post(tx);
// Store tx.id as reference for next run
Full Flow

1. Gelato triggers TEE execution
2. TEE loads encrypted state from Arweave (previous tx.id)
3. TEE fetches pending orders from OrderQueue contract (via ethers.js)
4. Decrypt orders, run P2P matching
5. Unmatched orders execute against AMM
6. Encrypt new state, upload to Arweave
7. Output callback-data for on-chain balance updates
8. External relayer or iExec callback submits transactions
   Components to Build
   File Purpose
   src/app.js Main entry - extend for batch mode
   src/orderMatcher.js P2P matching logic (orderbook)
   src/arweaveStorage.js State persistence to Arweave
   src/chainReader.js Read orders from OrderQueue via ethers
   src/chainWriter.js Submit batch transactions
   Ready to start implementation. Which component do you want me to build first?
