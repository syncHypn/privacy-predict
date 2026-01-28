/**
 * Submit an encrypted order to the OrderQueue contract
 *
 * Usage: npx tsx scripts/submitOrder.ts
 *
 * Required env vars:
 *   RPC_URL - Arbitrum Sepolia RPC URL
 *   PRIVATE_KEY - User's Ethereum private key (for signing tx)
 *   ORDER_QUEUE_ADDRESS - OrderQueue contract address
 *   TEE_PUBLIC_KEY - TEE's NaCl public key (hex)
 *   MARKET_ID - The market to trade on
 *
 * Optional env vars:
 *   ORDER_SIDE - BUY or SELL (default: BUY)
 *   ORDER_PRICE - Price between 0.01 and 0.99 (default: 0.5)
 *   ORDER_AMOUNT - Amount in wei/smallest unit (default: 10000000 = 10 USDC)
 *   OUTCOME_INDEX - Outcome index to trade (default: 0)
 */

import nacl from 'tweetnacl';
import tweetnaclUtil from 'tweetnacl-util';
const { encodeBase64, decodeBase64 } = tweetnaclUtil;
import { createWalletClient, createPublicClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia } from 'viem/chains';

// Order payload structure
interface OrderPayload {
  side: 'BUY' | 'SELL';
  outcomeIndex: number;
  price: number; // 0-100 representing probability %
  amount: bigint; // Amount in wei
  nonce: number;
  userPublicKey: Uint8Array;
}

// Encryption helpers
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function serializeOrderPayload(payload: OrderPayload): Uint8Array {
  const obj = {
    side: payload.side,
    outcomeIndex: payload.outcomeIndex,
    price: payload.price,
    amount: payload.amount.toString(),
    nonce: payload.nonce,
    userPublicKey: encodeBase64(payload.userPublicKey),
  };
  const json = JSON.stringify(obj);
  return new TextEncoder().encode(json);
}

function boxEncrypt(
  message: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): Uint8Array {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const encrypted = nacl.box(message, nonce, recipientPublicKey, senderSecretKey);
  if (!encrypted) throw new Error('Encryption failed');

  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);
  return result;
}

// OrderQueue ABI (minimal)
const orderQueueAbi = parseAbi([
  'function submitOrder(bytes32 marketId, bytes calldata encryptedPayload) external returns (bytes32 orderId)',
  'event OrderSubmitted(bytes32 indexed orderId, bytes32 indexed marketId, address indexed user, bytes encryptedPayload, uint256 timestamp)',
]);

async function main() {
  // Config from env
  const rpcUrl = process.env['RPC_URL'] || 'https://sepolia-rollup.arbitrum.io/rpc';
  const privateKey = process.env['PRIVATE_KEY'];
  const orderQueueAddress = process.env['ORDER_QUEUE_ADDRESS'] || '0xE5F1350f9087C175510FDaAF59AbBDaEeC54fB26';
  const teePublicKeyHex = process.env['TEE_PUBLIC_KEY'] || '0x2ce7ebbf286531909ee2f4fc403b2fe44c30962f321709fd1b90d144ae58b351';
  const marketId = process.env['MARKET_ID'];

  if (!privateKey) {
    console.error('PRIVATE_KEY env var required');
    process.exit(1);
  }

  if (!marketId) {
    console.error('MARKET_ID env var required');
    console.error('\nTo get a market ID, you can:');
    console.error('1. Create a market via MarketFactory contract');
    console.error('2. Query existing markets from MarketFactory.marketIds(index)');
    process.exit(1);
  }

  // Setup viem clients
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain: arbitrumSepolia,
    transport: http(rpcUrl),
  });

  console.log('=== Order Submission ===\n');
  console.log('User address:', account.address);
  console.log('OrderQueue:', orderQueueAddress);
  console.log('Market ID:', marketId);
  console.log('TEE Public Key:', teePublicKeyHex);

  // Generate user keypair for this order
  const userKeyPair = nacl.box.keyPair();
  console.log('\nUser NaCl public key:', bytesToHex(userKeyPair.publicKey));

  // Create order payload
  // Price is a decimal between 0.01 and 0.99 representing probability
  const side = (process.env['ORDER_SIDE'] || 'BUY') as 'BUY' | 'SELL';
  const price = parseFloat(process.env['ORDER_PRICE'] || '0.5');
  const amount = BigInt(process.env['ORDER_AMOUNT'] || '10000000'); // Default 10 USDC (6 decimals)
  const outcomeIndex = parseInt(process.env['OUTCOME_INDEX'] || '0', 10);

  const payload: OrderPayload = {
    side,
    outcomeIndex,
    price,
    amount,
    nonce: Date.now(),
    userPublicKey: userKeyPair.publicKey,
  };

  console.log('\nOrder payload:');
  console.log('  Side:', payload.side);
  console.log('  Outcome Index:', payload.outcomeIndex);
  console.log('  Price:', payload.price, '(probability)');
  console.log('  Amount:', payload.amount.toString(), 'wei');

  // Encrypt order
  const teePublicKey = hexToBytes(teePublicKeyHex);
  const serialized = serializeOrderPayload(payload);
  const encrypted = boxEncrypt(serialized, teePublicKey, userKeyPair.secretKey);

  // Prepend user's public key (TEE expects this format)
  const fullPayload = new Uint8Array(userKeyPair.publicKey.length + encrypted.length);
  fullPayload.set(userKeyPair.publicKey);
  fullPayload.set(encrypted, userKeyPair.publicKey.length);

  const encryptedHex = bytesToHex(fullPayload);
  console.log('\nEncrypted payload length:', fullPayload.length, 'bytes');

  // Submit order
  console.log('\nSubmitting order...');

  try {
    const hash = await walletClient.writeContract({
      address: orderQueueAddress as `0x${string}`,
      abi: orderQueueAbi,
      functionName: 'submitOrder',
      args: [marketId as `0x${string}`, encryptedHex as `0x${string}`],
    });

    console.log('Transaction hash:', hash);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('Confirmed in block:', receipt.blockNumber);

    // Parse logs to get orderId
    const logs = receipt.logs;
    if (logs.length > 0) {
      console.log('\nOrder submitted successfully!');
      console.log('Check TEE logs to see it being processed.');
    }
  } catch (error) {
    console.error('\nFailed to submit order:', error);
    process.exit(1);
  }
}

main().catch(console.error);
