/**
 * TEE Key Manager
 *
 * Manages cryptographic keys for the TEE:
 * - Box keypair for order encryption/decryption
 * - Sealed key for state encryption
 * - Attestation generation
 */
import type { Hex } from 'viem';
/**
 * iExec secrets format
 */
export interface IExecSecrets {
    /** TEE private key (base64 encoded) */
    teePrivateKey?: string;
    /** Sealed key for state encryption (base64 encoded) */
    sealedKey?: string;
}
/**
 * Key Manager class
 */
export declare class KeyManager {
    private keyPair;
    private sealedKey;
    private initialized;
    /**
     * Initialize from iExec secrets or generate new keys
     */
    initialize(secrets?: IExecSecrets): Promise<void>;
    /**
     * Initialize from environment variables (for local development)
     *
     * Uses TEE_NACL_PRIVATE_KEY (base64-encoded NaCl private key) for encryption.
     * This is separate from TEE_SIGNER_PRIVATE_KEY used for Ethereum transactions.
     */
    initializeFromEnv(): Promise<void>;
    /**
     * Ensure initialized
     */
    private ensureInitialized;
    /**
     * Get TEE public key as Uint8Array
     */
    getPublicKey(): Uint8Array;
    /**
     * Get TEE public key as hex string
     */
    getPublicKeyHex(): Hex;
    /**
     * Get TEE public key as base64 string
     */
    getPublicKeyBase64(): string;
    /**
     * Get TEE secret key as Uint8Array
     *
     * WARNING: This should only be used internally for decryption
     */
    getSecretKey(): Uint8Array;
    /**
     * Get sealed key for state encryption
     *
     * WARNING: This should only be used internally for state encryption
     */
    getSealedKey(): Uint8Array;
    /**
     * Generate attestation for on-chain verification
     *
     * In production, this would use Intel SGX attestation via iExec.
     * For MVP, we generate a simple signature-based attestation.
     */
    generateAttestation(data?: Uint8Array): Promise<Uint8Array>;
    /**
     * Pad box secret key to signing key length (for MVP only)
     */
    private padToSigningKey;
    /**
     * Export secrets for backup/recovery
     *
     * WARNING: Handle with extreme care - these are sensitive keys
     */
    exportSecrets(): IExecSecrets;
    /**
     * Check if initialized
     */
    isInitialized(): boolean;
    /**
     * Clear all keys (for cleanup/testing)
     */
    clear(): void;
}
/**
 * Get or create key manager instance
 */
export declare function getKeyManager(): KeyManager;
/**
 * Reset key manager (for testing)
 */
export declare function resetKeyManager(): void;
//# sourceMappingURL=keyManager.d.ts.map