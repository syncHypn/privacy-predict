#!/usr/bin/env node
// Submit a properly NaCl-encrypted order to OrderQueue

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import { ethers } from 'ethers';

// Configuration from .env
const RPC_URL = 'https://still-frosty-spring.arbitrum-sepolia.quiknode.pro/850ee3d91ff53d34e494478751a300822a58b24d/';
const PRIVATE_KEY = '0x7d3c1deeb445106fbb8fb0cee3208e8d73fbc4d0ba007a97c5964b9a33f2f9d7';
const ORDER_QUEUE_ADDRESS = '0x67b830886A47BbB5f2019eb129E81F217Ec56f09';
const MARKET_ID = '0x3a2b9c23a066c853f21b9cd7b727dfd8ec816de4d42444c25df3195ef5ef1834';

// TEE public key (from .env TEE_PUBLIC_KEY)
const TEE_PUBLIC_KEY = '0x2ce7ebbf286531909ee2f4fc403b2fe44c30962f321709fd1b90d144ae58b351';

// Order Queue ABI (minimal)
const ORDER_QUEUE_ABI = [
  'function submitOrder(bytes32 marketId, bytes encryptedPayload) returns (bytes32)',
  'event OrderSubmitted(bytes32 indexed orderId, bytes32 indexed marketId, address indexed user, bytes encryptedPayload, uint256 timestamp)',
];

/**
 * Encrypt an order for the TEE
 * Format: [user_public_key (32 bytes)][nonce (24 bytes)][encrypted_order]
 */
function encryptOrderForTEE(order, teePublicKeyHex) {
  // Generate ephemeral keypair for this order
  const userKeypair = nacl.box.keyPair();

  // Convert TEE public key from hex
  const teePublicKey = Buffer.from(teePublicKeyHex.slice(2), 'hex');

  // Generate random nonce
  const nonce = nacl.randomBytes(24);

  // Encode order as JSON
  const message = naclUtil.decodeUTF8(JSON.stringify(order));

  // Encrypt with NaCl box (X25519 + XSalsa20-Poly1305)
  const encrypted = nacl.box(message, nonce, teePublicKey, userKeypair.secretKey);

  // Combine: user_public_key (32) + nonce (24) + ciphertext
  const payload = new Uint8Array(32 + 24 + encrypted.length);
  payload.set(userKeypair.publicKey, 0);        // 32 bytes
  payload.set(nonce, 32);                        // 24 bytes
  payload.set(encrypted, 32 + 24);               // ciphertext

  return '0x' + Buffer.from(payload).toString('hex');
}

async function main() {
  console.log('=== Submit Encrypted Order ===\n');

  // Connect to chain
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const orderQueue = new ethers.Contract(ORDER_QUEUE_ADDRESS, ORDER_QUEUE_ABI, wallet);

  console.log('Wallet:', wallet.address);
  console.log('Market ID:', MARKET_ID);
  console.log('TEE Public Key:', TEE_PUBLIC_KEY);
  console.log('');

  // Create order payload
  // side: 'buy' or 'sell'
  // outcome: 'yes' or 'no'
  // amount: in USDC smallest units (6 decimals)
  const order = {
    side: 'buy',
    outcome: 'yes',
    amount: '1000000', // 1 USDC
  };

  console.log('Order:', order);

  // Encrypt order
  const encryptedPayload = encryptOrderForTEE(order, TEE_PUBLIC_KEY);
  console.log('Encrypted payload length:', (encryptedPayload.length - 2) / 2, 'bytes');
  console.log('Encrypted payload:', encryptedPayload.slice(0, 66) + '...');
  console.log('');

  // Submit order
  console.log('Submitting order to OrderQueue...');
  const tx = await orderQueue.submitOrder(MARKET_ID, encryptedPayload);
  console.log('Transaction hash:', tx.hash);

  // Wait for confirmation
  const receipt = await tx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);

  // Get order ID from event
  const event = receipt.logs.find(log => {
    try {
      const parsed = orderQueue.interface.parseLog(log);
      return parsed?.name === 'OrderSubmitted';
    } catch { return false; }
  });

  if (event) {
    const parsed = orderQueue.interface.parseLog(event);
    console.log('Order ID:', parsed.args.orderId);
  }

  console.log('\nOrder submitted successfully!');
  console.log('Run the TEE matcher to process it.');
}

main().catch(console.error);
