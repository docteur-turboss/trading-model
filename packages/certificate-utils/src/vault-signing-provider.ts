/**
 * VaultSigningProvider — adapts VaultTransitClient to the SigningProvider interface.
 *
 * Delegates all signing operations to HashiCorp Vault Transit,
 * so the CA private key never leaves Vault's HSM boundary.
 */
import type { SigningProvider } from "./signing-provider";
import type { VaultTransitClient } from "./vault-transit-client";

export class VaultSigningProvider implements SigningProvider {
	private readonly _vault: VaultTransitClient;
	private readonly _keyName: string;
	private _publicKeyPem: string | null = null;

	constructor(vault: VaultTransitClient, keyName: string) {
		this._vault = vault;
		this._keyName = keyName;
	}

	async getPublicKey(): Promise<string> {
		if (!this._publicKeyPem) {
			this._publicKeyPem = await this._vault.readPublicKey(this._keyName);
		}
		return this._publicKeyPem;
	}

	async sign(tbsDerBytes: Buffer): Promise<Buffer> {
		const derBinary = tbsDerBytes.toString("binary");
		const signatureBinary = await this._vault.signBytes(
			this._keyName,
			derBinary
		);
		return Buffer.from(signatureBinary, "binary");
	}

	isRemote(): boolean {
		return true;
	}

	destroy(): void {
		this._vault.destroy();
	}
}
