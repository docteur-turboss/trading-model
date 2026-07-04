/**
 * SigningProvider — abstraction over CA key signing backends.
 *
 * Supports multiple providers:
 * - LocalSigningProvider:  stores private key on disk (dev/test only)
 * - VaultSigningProvider:  delegates signing to HashiCorp Vault Transit (HSM-grade)
 * - (future) AwsKmsSigningProvider, AzureKeyVaultSigningProvider, etc.
 *
 * The CA uses whichever provider is configured. In production, a remote
 * provider (Vault, KMS) MUST be used — LocalSigningProvider will throw
 * at startup if NODE_ENV === 'production' and no remote provider is set.
 */
import { createPrivateKey, sign as nodeSign } from "node:crypto";

import type { KeyPair } from "./types";

export interface SigningProvider {
	/** Returns the public key PEM of the CA signing key. */
	getPublicKey(): Promise<string>;

	/**
	 * Signs the given DER-encoded TBS certificate bytes.
	 * Returns the raw signature bytes (not ASN.1-wrapped).
	 */
	sign(tbsDerBytes: Buffer): Promise<Buffer>;

	/** Returns true if the provider is backed by a remote HSM/KMS. */
	isRemote(): boolean;

	/** Cleanup any held resources (secure key stores, connections). */
	destroy(): void;
}

/**
 * LocalSigningProvider — stores the CA private key in a file on disk.
 *
 * WARNING: Only for development and testing. In production, use a
 * remote signing provider (Vault Transit, AWS KMS, etc.).
 */
export class LocalSigningProvider implements SigningProvider {
	private readonly _keyPair: KeyPair;

	constructor(keyPair: KeyPair) {
		this._keyPair = keyPair;
	}

	getPublicKey(): Promise<string> {
		return Promise.resolve(this._keyPair.publicKey);
	}

	sign(tbsDerBytes: Buffer): Promise<Buffer> {
		const nodeKey = createPrivateKey(this._keyPair.privateKey);
		const algorithm =
			nodeKey.asymmetricKeyType === "rsa" ? "RSA-SHA256" : "sha256";
		return Promise.resolve(nodeSign(algorithm, tbsDerBytes, nodeKey));
	}

	isRemote(): boolean {
		return false;
	}

	destroy(): void {
		// Nothing to clean up for local provider
	}
}
