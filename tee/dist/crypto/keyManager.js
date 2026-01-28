/**
 * TEE Key Manager
 *
 * Manages cryptographic keys for the TEE:
 * - Box keypair for order encryption/decryption
 * - Sealed key for state encryption
 * - Attestation generation
 */
import nacl from 'tweetnacl';
import tweetnaclUtil from 'tweetnacl-util';
const { encodeBase64, decodeBase64 } = tweetnaclUtil;
import { ConfigurationError } from '../utils/errors.js';
import { createLogger } from '../utils/logger.js';
import { bytesToHex, generateSecretKey } from './encryption.js';
const logger = createLogger('KeyManager');
/**
 * Key Manager class
 */
export class KeyManager {
    keyPair = null;
    sealedKey = null;
    initialized = false;
    /**
     * Initialize from iExec secrets or generate new keys
     */
    async initialize(secrets) {
        if (this.initialized) {
            logger.warn('KeyManager already initialized');
            return;
        }
        // Initialize TEE keypair
        if (secrets?.teePrivateKey) {
            // Restore from secrets
            const privateKey = decodeBase64(secrets.teePrivateKey);
            this.keyPair = nacl.box.keyPair.fromSecretKey(privateKey);
            logger.info('Restored TEE keypair from secrets');
        }
        else {
            // Generate new keypair (for development/testing)
            this.keyPair = nacl.box.keyPair();
            logger.warn('Generated new TEE keypair - use secrets in production');
        }
        // Initialize sealed key for state encryption
        if (secrets?.sealedKey) {
            this.sealedKey = decodeBase64(secrets.sealedKey);
            logger.info('Restored sealed key from secrets');
        }
        else {
            // Generate new sealed key (for development/testing)
            this.sealedKey = generateSecretKey();
            logger.warn('Generated new sealed key - use secrets in production');
        }
        this.initialized = true;
        logger.info('KeyManager initialized', {
            publicKey: this.getPublicKeyHex(),
        });
    }
    /**
     * Initialize from environment variables (for local development)
     *
     * Uses TEE_NACL_PRIVATE_KEY (base64-encoded NaCl private key) for encryption.
     * This is separate from TEE_SIGNER_PRIVATE_KEY used for Ethereum transactions.
     */
    async initializeFromEnv() {
        const teeNaclPrivateKey = process.env['TEE_NACL_PRIVATE_KEY'];
        const sealedKey = process.env['SEALED_KEY'];
        await this.initialize({
            teePrivateKey: teeNaclPrivateKey || undefined,
            sealedKey: sealedKey || undefined,
        });
    }
    /**
     * Ensure initialized
     */
    ensureInitialized() {
        if (!this.initialized || !this.keyPair || !this.sealedKey) {
            throw new ConfigurationError('KeyManager not initialized');
        }
    }
    /**
     * Get TEE public key as Uint8Array
     */
    getPublicKey() {
        this.ensureInitialized();
        return this.keyPair.publicKey;
    }
    /**
     * Get TEE public key as hex string
     */
    getPublicKeyHex() {
        return bytesToHex(this.getPublicKey());
    }
    /**
     * Get TEE public key as base64 string
     */
    getPublicKeyBase64() {
        return encodeBase64(this.getPublicKey());
    }
    /**
     * Get TEE secret key as Uint8Array
     *
     * WARNING: This should only be used internally for decryption
     */
    getSecretKey() {
        this.ensureInitialized();
        return this.keyPair.secretKey;
    }
    /**
     * Get sealed key for state encryption
     *
     * WARNING: This should only be used internally for state encryption
     */
    getSealedKey() {
        this.ensureInitialized();
        return this.sealedKey;
    }
    /**
     * Generate attestation for on-chain verification
     *
     * In production, this would use Intel SGX attestation via iExec.
     * For MVP, we generate a simple signature-based attestation.
     */
    async generateAttestation(data) {
        this.ensureInitialized();
        // For MVP: Create a simple attestation structure
        // In production: Use iExec SDK to get SGX attestation
        const attestationData = {
            publicKey: this.getPublicKeyBase64(),
            timestamp: Date.now(),
            data: data ? encodeBase64(data) : undefined,
        };
        const attestationJson = JSON.stringify(attestationData);
        const attestationBytes = new TextEncoder().encode(attestationJson);
        // Sign the attestation (in production, this would be SGX-signed)
        const signature = nacl.sign.detached(attestationBytes, 
        // For box keypair, we need to convert or use a separate signing keypair
        // For MVP, we'll just use the first 64 bytes padded
        this.padToSigningKey(this.keyPair.secretKey));
        // Combine attestation + signature
        const result = new Uint8Array(attestationBytes.length + signature.length + 4);
        const view = new DataView(result.buffer);
        view.setUint32(0, attestationBytes.length, true);
        result.set(attestationBytes, 4);
        result.set(signature, 4 + attestationBytes.length);
        return result;
    }
    /**
     * Pad box secret key to signing key length (for MVP only)
     */
    padToSigningKey(boxSecretKey) {
        // Generate a deterministic signing keypair from box secret key
        const seed = boxSecretKey.slice(0, 32);
        const signingKeyPair = nacl.sign.keyPair.fromSeed(seed);
        return signingKeyPair.secretKey;
    }
    /**
     * Export secrets for backup/recovery
     *
     * WARNING: Handle with extreme care - these are sensitive keys
     */
    exportSecrets() {
        this.ensureInitialized();
        return {
            teePrivateKey: encodeBase64(this.keyPair.secretKey),
            sealedKey: encodeBase64(this.sealedKey),
        };
    }
    /**
     * Check if initialized
     */
    isInitialized() {
        return this.initialized;
    }
    /**
     * Clear all keys (for cleanup/testing)
     */
    clear() {
        if (this.keyPair) {
            // Zero out sensitive data
            this.keyPair.secretKey.fill(0);
        }
        if (this.sealedKey) {
            this.sealedKey.fill(0);
        }
        this.keyPair = null;
        this.sealedKey = null;
        this.initialized = false;
    }
}
/**
 * Singleton key manager instance
 */
let keyManagerInstance = null;
/**
 * Get or create key manager instance
 */
export function getKeyManager() {
    if (!keyManagerInstance) {
        keyManagerInstance = new KeyManager();
    }
    return keyManagerInstance;
}
/**
 * Reset key manager (for testing)
 */
export function resetKeyManager() {
    if (keyManagerInstance) {
        keyManagerInstance.clear();
    }
    keyManagerInstance = null;
}
//# sourceMappingURL=keyManager.js.map