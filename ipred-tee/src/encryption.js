/**
 * Encryption module for iPred TEE
 * Uses NaCl (TweetNaCl) for all cryptographic operations
 *
 * Two encryption schemes:
 * 1. Symmetric (secretbox) - for balance encryption with sealed key
 * 2. Asymmetric (box) - for order encryption between user and TEE
 */

import nacl from 'tweetnacl';
import { Buffer } from 'node:buffer';

/**
 * Converts a hex string to Uint8Array
 * @param {string} hex - Hex string (with or without 0x prefix)
 * @returns {Uint8Array}
 */
export function hexToBytes(hex) {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Converts Uint8Array to hex string
 * @param {Uint8Array} bytes
 * @returns {string} Hex string with 0x prefix
 */
export function bytesToHex(bytes) {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a new random 32-byte key for sealing
 * @returns {Uint8Array} 32-byte key
 */
export function generateSealedKey() {
  return nacl.randomBytes(32);
}

/**
 * Generates a new X25519 keypair for asymmetric encryption
 * @returns {{ publicKey: Uint8Array, secretKey: Uint8Array }}
 */
export function generateKeyPair() {
  return nacl.box.keyPair();
}

// ============================================================
// Balance Encryption (Symmetric - secretbox)
// ============================================================

/**
 * Encrypts a balance value using NaCl secretbox
 * @param {bigint} value - The balance value to encrypt
 * @param {Uint8Array} sealedKey - 32-byte symmetric key
 * @returns {{ nonce: string, ciphertext: string }} Encrypted balance
 */
export function encryptBalance(value, sealedKey) {
  // Generate fresh randomness for this encryption
  const randomness = nacl.randomBytes(32);

  // Create payload with value + randomness + timestamp
  const payload = JSON.stringify({
    value: value.toString(),
    r: bytesToHex(randomness),
    timestamp: Date.now(),
  });

  // Encrypt with sealed key (XSalsa20-Poly1305)
  const nonce = nacl.randomBytes(24);
  const message = new TextEncoder().encode(payload);
  const ciphertext = nacl.secretbox(message, nonce, sealedKey);

  return {
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
  };
}

/**
 * Decrypts an encrypted balance
 * @param {{ nonce: string, ciphertext: string }} encrypted
 * @param {Uint8Array} sealedKey - 32-byte symmetric key
 * @returns {bigint} The decrypted balance value
 */
export function decryptBalance(encrypted, sealedKey) {
  const nonce = hexToBytes(encrypted.nonce);
  const ciphertext = hexToBytes(encrypted.ciphertext);

  const decrypted = nacl.secretbox.open(ciphertext, nonce, sealedKey);
  if (!decrypted) {
    throw new Error('DECRYPTION_FAILED: Invalid ciphertext or key');
  }

  const payload = JSON.parse(new TextDecoder().decode(decrypted));
  return BigInt(payload.value);
}

// ============================================================
// Order Encryption (Asymmetric - box)
// ============================================================

/**
 * @typedef {Object} OrderPayload
 * @property {'BUY' | 'SELL'} side - Order side
 * @property {number} outcomeIndex - 0 for YES, 1 for NO
 * @property {string} amount - Amount as string (to preserve bigint precision)
 * @property {number} nonce - Order nonce for replay protection
 * @property {number} timestamp - Order creation timestamp
 */

/**
 * Encrypts an order payload for sending to TEE
 * @param {OrderPayload} order - The order to encrypt
 * @param {Uint8Array} teePublicKey - TEE's X25519 public key
 * @param {Uint8Array} userSecretKey - User's X25519 secret key
 * @returns {{ nonce: string, ciphertext: string, userPublicKey: string }}
 */
export function encryptOrder(order, teePublicKey, userSecretKey) {
  const nonce = nacl.randomBytes(24);
  const message = new TextEncoder().encode(JSON.stringify(order));

  // X25519 key exchange + XSalsa20-Poly1305
  const ciphertext = nacl.box(message, nonce, teePublicKey, userSecretKey);
  const userKeyPair = nacl.box.keyPair.fromSecretKey(userSecretKey);

  return {
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
    userPublicKey: bytesToHex(userKeyPair.publicKey),
  };
}

/**
 * Decrypts an order payload in the TEE
 * @param {{ nonce: string, ciphertext: string, userPublicKey: string }} encrypted
 * @param {Uint8Array} teeSecretKey - TEE's X25519 secret key
 * @returns {OrderPayload}
 */
export function decryptOrder(encrypted, teeSecretKey) {
  const nonce = hexToBytes(encrypted.nonce);
  const ciphertext = hexToBytes(encrypted.ciphertext);
  const userPublicKey = hexToBytes(encrypted.userPublicKey);

  const decrypted = nacl.box.open(ciphertext, nonce, userPublicKey, teeSecretKey);
  if (!decrypted) {
    throw new Error('DECRYPTION_FAILED: Invalid order encryption');
  }

  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ============================================================
// State Encryption (for Arweave persistence)
// ============================================================

/**
 * Encrypts full state for Arweave storage
 * @param {object} state - State object to encrypt
 * @param {Uint8Array} sealedKey - 32-byte symmetric key
 * @returns {string} Base64-encoded encrypted state
 */
export function encryptState(state, sealedKey) {
  const nonce = nacl.randomBytes(24);
  // Handle BigInt serialization
  const stateJson = JSON.stringify(state, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  );
  const message = new TextEncoder().encode(stateJson);
  const ciphertext = nacl.secretbox(message, nonce, sealedKey);

  // Combine nonce + ciphertext for storage
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);

  return Buffer.from(combined).toString('base64');
}

/**
 * Decrypts state from Arweave storage
 * @param {string} encryptedBase64 - Base64-encoded encrypted state
 * @param {Uint8Array} sealedKey - 32-byte symmetric key
 * @returns {object} Decrypted state object
 */
export function decryptState(encryptedBase64, sealedKey) {
  const combined = Buffer.from(encryptedBase64, 'base64');
  const nonce = combined.subarray(0, 24);
  const ciphertext = combined.subarray(24);

  const decrypted = nacl.secretbox.open(ciphertext, nonce, sealedKey);
  if (!decrypted) {
    throw new Error('DECRYPTION_FAILED: Invalid state encryption');
  }

  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ============================================================
// Utility Functions
// ============================================================

/**
 * Computes a commitment hash for a balance (for on-chain identification)
 * @param {{ nonce: string, ciphertext: string }} encrypted
 * @returns {{ x: string, y: string }} Commitment structure
 */
export function computeCommitment(encrypted) {
  const data = hexToBytes(encrypted.nonce + encrypted.ciphertext.slice(2));
  const hash = nacl.hash(data);

  return {
    x: bytesToHex(hash.subarray(0, 32)),
    y: bytesToHex(hash.subarray(32, 64)),
  };
}

/**
 * Verifies that a decrypted value matches a commitment
 * @param {bigint} value
 * @param {{ x: string, y: string }} commitment
 * @param {{ nonce: string, ciphertext: string }} encrypted
 * @returns {boolean}
 */
export function verifyCommitment(value, commitment, encrypted) {
  const computed = computeCommitment(encrypted);
  return computed.x === commitment.x && computed.y === commitment.y;
}

/**
 * Re-encrypts a plaintext string for a specific user using NaCl box (asymmetric).
 * Used by the balance query flow: TEE decrypts the balance with sealed key,
 * then re-encrypts it with the user's ephemeral NaCl public key.
 * @param {string} plaintext - JSON string of balances to encrypt
 * @param {Uint8Array} userPublicKey - User's X25519 public key (32 bytes)
 * @returns {{ nonce: string, ciphertext: string, teePublicKey: string }}
 */
export function encryptForUser(plaintext, userPublicKey) {
  const teeKeyPair = nacl.box.keyPair();
  const nonce = nacl.randomBytes(24);
  const message = new TextEncoder().encode(plaintext);
  const ciphertext = nacl.box(message, nonce, userPublicKey, teeKeyPair.secretKey);

  return {
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
    teePublicKey: bytesToHex(teeKeyPair.publicKey),
  };
}

export default {
  hexToBytes,
  bytesToHex,
  generateSealedKey,
  generateKeyPair,
  encryptBalance,
  decryptBalance,
  encryptOrder,
  decryptOrder,
  encryptState,
  decryptState,
  computeCommitment,
  verifyCommitment,
  encryptForUser,
};
