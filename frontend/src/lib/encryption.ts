import nacl from "tweetnacl";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`;
}

export function generateKeyPair() {
  return nacl.box.keyPair();
}

export interface OrderPayload {
  side: "BUY" | "SELL";
  outcomeIndex: number;
  amount: string;
  nonce: number;
  timestamp: number;
}

export interface EncryptedOrderPayload {
  nonce: string;
  ciphertext: string;
  userPublicKey: string;
}

/**
 * Encrypts an order payload for sending to TEE.
 * Uses X25519 key exchange + XSalsa20-Poly1305.
 */
export function encryptOrder(
  order: OrderPayload,
  teePublicKey: Uint8Array,
  userSecretKey: Uint8Array
): EncryptedOrderPayload {
  const nonce = nacl.randomBytes(24);
  const message = new TextEncoder().encode(JSON.stringify(order));
  const ciphertext = nacl.box(message, nonce, teePublicKey, userSecretKey);
  const userKeyPair = nacl.box.keyPair.fromSecretKey(userSecretKey);

  return {
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ciphertext),
    userPublicKey: bytesToHex(userKeyPair.publicKey),
  };
}

/**
 * Encrypts a withdrawal amount for the TEE.
 * Returns the encrypted bytes and a commitment hash.
 */
export function encryptWithdrawal(
  amount: string,
  teePublicKey: Uint8Array,
  userSecretKey: Uint8Array
): { encryptedAmount: `0x${string}`; commitmentHash: `0x${string}` } {
  const nonce = nacl.randomBytes(24);
  const payload = JSON.stringify({
    amount,
    timestamp: Math.floor(Date.now() / 1000),
  });
  const message = new TextEncoder().encode(payload);
  const ciphertext = nacl.box(message, nonce, teePublicKey, userSecretKey);
  const userKeyPair = nacl.box.keyPair.fromSecretKey(userSecretKey);

  // Pack: nonce(24) + userPubKey(32) + ciphertext
  const combined = new Uint8Array(
    nonce.length + userKeyPair.publicKey.length + ciphertext.length
  );
  combined.set(nonce, 0);
  combined.set(userKeyPair.publicKey, nonce.length);
  combined.set(ciphertext, nonce.length + userKeyPair.publicKey.length);

  const encryptedAmount = bytesToHex(combined);

  // Commitment = hash of the encrypted payload
  const hash = nacl.hash(combined);
  const commitmentHash = bytesToHex(hash.subarray(0, 32));

  return { encryptedAmount, commitmentHash };
}

/**
 * Serializes an encrypted order into bytes for on-chain submission.
 * Format: nonce (24 bytes) + userPublicKey (32 bytes) + ciphertext (variable)
 */
export function encryptedOrderToBytes(
  encrypted: EncryptedOrderPayload
): `0x${string}` {
  const nonce = hexToBytes(encrypted.nonce);
  const userPublicKey = hexToBytes(encrypted.userPublicKey);
  const ciphertext = hexToBytes(encrypted.ciphertext);

  const combined = new Uint8Array(
    nonce.length + userPublicKey.length + ciphertext.length
  );
  combined.set(nonce, 0);
  combined.set(userPublicKey, nonce.length);
  combined.set(ciphertext, nonce.length + userPublicKey.length);

  return bytesToHex(combined);
}
