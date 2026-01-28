/**
 * Generate NaCl keys for TEE
 *
 * Usage: npx tsx scripts/generateKeys.ts
 */

import nacl from 'tweetnacl';
import tweetnaclUtil from 'tweetnacl-util';
const { encodeBase64 } = tweetnaclUtil;

function generateKeys() {
  // Generate box keypair for encryption/decryption
  const boxKeyPair = nacl.box.keyPair();

  // Generate sealed key for state encryption
  const sealedKey = nacl.randomBytes(32);

  // Convert to hex for display
  const publicKeyHex =
    '0x' +
    Buffer.from(boxKeyPair.publicKey).toString('hex');

  console.log('=== TEE Keys Generated ===\n');

  console.log('# Add these to your environment:\n');

  console.log(`TEE_NACL_PRIVATE_KEY=${encodeBase64(boxKeyPair.secretKey)}`);
  console.log(`SEALED_KEY=${encodeBase64(sealedKey)}`);

  console.log('\n# Public key (for order encryption):');
  console.log(`TEE_PUBLIC_KEY=${publicKeyHex}`);
  console.log(`TEE_PUBLIC_KEY_BASE64=${encodeBase64(boxKeyPair.publicKey)}`);

  console.log('\n=== Keep these keys secure! ===');
}

generateKeys();
