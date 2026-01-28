/**
 * NaCl encryption utilities for order encryption/decryption
 *
 * Uses TweetNaCl for:
 * - Box encryption (X25519 + XSalsa20-Poly1305) for order payloads
 * - SecretBox encryption (XSalsa20-Poly1305) for state encryption
 */

import nacl from 'tweetnacl';
import tweetnaclUtil from 'tweetnacl-util';
const { encodeBase64, decodeBase64 } = tweetnaclUtil;
import type { OrderPayload } from '../types.js';
import { DecryptionError } from '../utils/errors.js';

/**
 * Generate a new keypair for encryption
 */
export function generateKeyPair(): nacl.BoxKeyPair {
  return nacl.box.keyPair();
}

/**
 * Generate a random nonce for box encryption
 */
export function generateNonce(): Uint8Array {
  return nacl.randomBytes(nacl.box.nonceLength);
}

/**
 * Generate a random key for secret box encryption
 */
export function generateSecretKey(): Uint8Array {
  return nacl.randomBytes(nacl.secretbox.keyLength);
}

/**
 * Encrypt data with NaCl box (asymmetric)
 *
 * @param message - Data to encrypt
 * @param recipientPublicKey - Recipient's public key
 * @param senderSecretKey - Sender's secret key
 * @returns Encrypted data with nonce prepended
 */
export function boxEncrypt(
  message: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array
): Uint8Array {
  const nonce = generateNonce();
  const encrypted = nacl.box(message, nonce, recipientPublicKey, senderSecretKey);

  if (!encrypted) {
    throw new DecryptionError('Box encryption failed');
  }

  // Prepend nonce to encrypted data
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);

  return result;
}

/**
 * Decrypt data with NaCl box (asymmetric)
 *
 * @param encryptedWithNonce - Encrypted data with nonce prepended
 * @param senderPublicKey - Sender's public key
 * @param recipientSecretKey - Recipient's secret key
 * @returns Decrypted data
 */
export function boxDecrypt(
  encryptedWithNonce: Uint8Array,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array
): Uint8Array {
  if (encryptedWithNonce.length < nacl.box.nonceLength) {
    throw new DecryptionError('Encrypted data too short');
  }

  const nonce = encryptedWithNonce.slice(0, nacl.box.nonceLength);
  const encrypted = encryptedWithNonce.slice(nacl.box.nonceLength);

  const decrypted = nacl.box.open(encrypted, nonce, senderPublicKey, recipientSecretKey);

  if (!decrypted) {
    throw new DecryptionError('Box decryption failed - invalid data or wrong keys');
  }

  return decrypted;
}

/**
 * Encrypt data with NaCl secretbox (symmetric)
 *
 * @param message - Data to encrypt
 * @param key - Secret key (32 bytes)
 * @returns Encrypted data with nonce prepended
 */
export function secretBoxEncrypt(message: Uint8Array, key: Uint8Array): Uint8Array {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const encrypted = nacl.secretbox(message, nonce, key);

  // Prepend nonce to encrypted data
  const result = new Uint8Array(nonce.length + encrypted.length);
  result.set(nonce);
  result.set(encrypted, nonce.length);

  return result;
}

/**
 * Decrypt data with NaCl secretbox (symmetric)
 *
 * @param encryptedWithNonce - Encrypted data with nonce prepended
 * @param key - Secret key (32 bytes)
 * @returns Decrypted data
 */
export function secretBoxDecrypt(encryptedWithNonce: Uint8Array, key: Uint8Array): Uint8Array {
  if (encryptedWithNonce.length < nacl.secretbox.nonceLength) {
    throw new DecryptionError('Encrypted data too short');
  }

  const nonce = encryptedWithNonce.slice(0, nacl.secretbox.nonceLength);
  const encrypted = encryptedWithNonce.slice(nacl.secretbox.nonceLength);

  const decrypted = nacl.secretbox.open(encrypted, nonce, key);

  if (!decrypted) {
    throw new DecryptionError('Secretbox decryption failed - invalid data or wrong key');
  }

  return decrypted;
}

/**
 * Serialize an order payload for encryption
 */
export function serializeOrderPayload(payload: OrderPayload): Uint8Array {
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

/**
 * Deserialize an order payload from decrypted bytes
 */
export function deserializeOrderPayload(data: Uint8Array): OrderPayload {
  try {
    const json = new TextDecoder().decode(data);
    const obj = JSON.parse(json) as {
      side: 'BUY' | 'SELL';
      outcomeIndex: number;
      price: number;
      amount: string;
      nonce: number;
      userPublicKey: string;
    };

    return {
      side: obj.side,
      outcomeIndex: obj.outcomeIndex,
      price: obj.price,
      amount: BigInt(obj.amount),
      nonce: obj.nonce,
      userPublicKey: decodeBase64(obj.userPublicKey),
    };
  } catch (error) {
    throw new DecryptionError('Failed to deserialize order payload', {
      error: String(error),
    });
  }
}

/**
 * Encrypt an order payload for submission to the TEE
 *
 * This is a reference implementation for client-side usage
 *
 * @param payload - Order payload to encrypt
 * @param teePublicKey - TEE's public key
 * @param userSecretKey - User's secret key
 * @returns Encrypted payload as base64 string
 */
export function encryptOrderForTEE(
  payload: OrderPayload,
  teePublicKey: Uint8Array,
  userSecretKey: Uint8Array
): string {
  const serialized = serializeOrderPayload(payload);
  const encrypted = boxEncrypt(serialized, teePublicKey, userSecretKey);
  return encodeBase64(encrypted);
}

/**
 * Decrypt an order payload inside the TEE
 *
 * @param encryptedBase64 - Base64-encoded encrypted payload
 * @param userPublicKey - User's public key (from event)
 * @param teeSecretKey - TEE's secret key
 * @returns Decrypted order payload
 */
export function decryptOrderInTEE(
  encryptedBase64: string,
  userPublicKey: Uint8Array,
  teeSecretKey: Uint8Array
): OrderPayload {
  const encrypted = decodeBase64(encryptedBase64);
  const decrypted = boxDecrypt(encrypted, userPublicKey, teeSecretKey);
  return deserializeOrderPayload(decrypted);
}

/**
 * Encrypt a response for the user
 *
 * @param data - Data to encrypt
 * @param userPublicKey - User's public key
 * @param teeSecretKey - TEE's secret key
 * @returns Base64-encoded encrypted data
 */
export function encryptResponseForUser(
  data: unknown,
  userPublicKey: Uint8Array,
  teeSecretKey: Uint8Array
): string {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  const encrypted = boxEncrypt(bytes, userPublicKey, teeSecretKey);
  return encodeBase64(encrypted);
}

/**
 * Convert hex string to Uint8Array
 */
export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return '0x' + Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export { encodeBase64, decodeBase64 };
