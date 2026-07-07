/**
 * VaultSigningProvider — adapts VaultTransitClient to the SigningProvider interface.
 *
 * Delegates all signing operations to HashiCorp Vault Transit,
 * so the CA private key never leaves Vault's HSM boundary.
 */
import type { SigningProvider } from "../signing/signing-provider";
import type { VaultTransitClient } from "./vault-transit-client";

export class VaultSigningProvider implements SigningProvider {
	private readonly _vault: VaultTransitClient;
	private readonly _keyName: string;
	private _publicKeyPem: string;

	constructor(
		vault: VaultTransitClient,
		keyName: string,
		publicKeyPem: string
	) {
		this._vault = vault;
		this._keyName = keyName;
		this._publicKeyPem = publicKeyPem;
	}

	async getPublicKey(): Promise<string> {
		return this._publicKeyPem;
	}

	static async create(
		vault: VaultTransitClient,
		keyName: string
	): Promise<VaultSigningProvider> {
		const publicKeyPem = await vault.readPublicKey(keyName);
		return new VaultSigningProvider(vault, keyName, publicKeyPem);
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
