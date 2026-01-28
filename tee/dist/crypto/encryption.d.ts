/**
 * NaCl encryption utilities for order encryption/decryption
 *
 * Uses TweetNaCl for:
 * - Box encryption (X25519 + XSalsa20-Poly1305) for order payloads
 * - SecretBox encryption (XSalsa20-Poly1305) for state encryption
 */
import nacl from 'tweetnacl';
declare const encodeBase64: (arr: Uint8Array) => string, decodeBase64: (s: string) => Uint8Array;
import type { OrderPayload } from '../types.js';
/**
 * Generate a new keypair for encryption
 */
export declare function generateKeyPair(): nacl.BoxKeyPair;
/**
 * Generate a random nonce for box encryption
 */
export declare function generateNonce(): Uint8Array;
/**
 * Generate a random key for secret box encryption
 */
export declare function generateSecretKey(): Uint8Array;
/**
 * Encrypt data with NaCl box (asymmetric)
 *
 * @param message - Data to encrypt
 * @param recipientPublicKey - Recipient's public key
 * @param senderSecretKey - Sender's secret key
 * @returns Encrypted data with nonce prepended
 */
export declare function boxEncrypt(message: Uint8Array, recipientPublicKey: Uint8Array, senderSecretKey: Uint8Array): Uint8Array;
/**
 * Decrypt data with NaCl box (asymmetric)
 *
 * @param encryptedWithNonce - Encrypted data with nonce prepended
 * @param senderPublicKey - Sender's public key
 * @param recipientSecretKey - Recipient's secret key
 * @returns Decrypted data
 */
export declare function boxDecrypt(encryptedWithNonce: Uint8Array, senderPublicKey: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array;
/**
 * Encrypt data with NaCl secretbox (symmetric)
 *
 * @param message - Data to encrypt
 * @param key - Secret key (32 bytes)
 * @returns Encrypted data with nonce prepended
 */
export declare function secretBoxEncrypt(message: Uint8Array, key: Uint8Array): Uint8Array;
/**
 * Decrypt data with NaCl secretbox (symmetric)
 *
 * @param encryptedWithNonce - Encrypted data with nonce prepended
 * @param key - Secret key (32 bytes)
 * @returns Decrypted data
 */
export declare function secretBoxDecrypt(encryptedWithNonce: Uint8Array, key: Uint8Array): Uint8Array;
/**
 * Serialize an order payload for encryption
 */
export declare function serializeOrderPayload(payload: OrderPayload): Uint8Array;
/**
 * Deserialize an order payload from decrypted bytes
 */
export declare function deserializeOrderPayload(data: Uint8Array): OrderPayload;
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
export declare function encryptOrderForTEE(payload: OrderPayload, teePublicKey: Uint8Array, userSecretKey: Uint8Array): string;
/**
 * Decrypt an order payload inside the TEE
 *
 * @param encryptedBase64 - Base64-encoded encrypted payload
 * @param userPublicKey - User's public key (from event)
 * @param teeSecretKey - TEE's secret key
 * @returns Decrypted order payload
 */
export declare function decryptOrderInTEE(encryptedBase64: string, userPublicKey: Uint8Array, teeSecretKey: Uint8Array): OrderPayload;
/**
 * Encrypt a response for the user
 *
 * @param data - Data to encrypt
 * @param userPublicKey - User's public key
 * @param teeSecretKey - TEE's secret key
 * @returns Base64-encoded encrypted data
 */
export declare function encryptResponseForUser(data: unknown, userPublicKey: Uint8Array, teeSecretKey: Uint8Array): string;
/**
 * Convert hex string to Uint8Array
 */
export declare function hexToBytes(hex: string): Uint8Array;
/**
 * Convert Uint8Array to hex string
 */
export declare function bytesToHex(bytes: Uint8Array): string;
export { encodeBase64, decodeBase64 };
//# sourceMappingURL=encryption.d.ts.map