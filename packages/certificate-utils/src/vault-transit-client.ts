import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";

import {
	type VaultTransitConfig,
	VaultTransitHttp,
} from "./vault-transit-http";

export type { VaultTransitConfig } from "./vault-transit-http";

export class VaultTransitClient {
	private readonly _http: VaultTransitHttp;

	constructor(config: VaultTransitConfig) {
		this._http = new VaultTransitHttp(config);
	}

	async createKey(
		name: string,
		keyType: "rsa-4096" | "ecdsa-p384"
	): Promise<void> {
		const vaultKeyType = keyType === "rsa-4096" ? "rsa-4096" : "ecdsa-p384";
		await this._http.createKey(name, vaultKeyType);
	}

	async sign(name: string, algorithm: string, input: string): Promise<string> {
		const result = await this._http.postSign(name, {
			input: Buffer.from(input, "utf8").toString("base64"),
			hash_algorithm: this._http.getHashAlgorithm(algorithm),
		});
		return this._http.getSignatureString(result);
	}

	async signBytes(name: string, derBytes: string): Promise<string> {
		const result = await this._http.postSign(name, {
			input: Buffer.from(derBytes, "binary").toString("base64"),
			hash_algorithm: "sha2-256",
		});
		const signatureBase64 = this._http.getSignatureString(result);
		return Buffer.from(signatureBase64, "base64").toString("binary");
	}

	async readPublicKey(name: string): Promise<string> {
		return this._http.readPublicKey(name);
	}

	async keyExists(name: string): Promise<boolean> {
		try {
			await this.readPublicKey(name);
			return true;
		} catch (err) {
			logger.warn(
				"Vault key existence check failed — assuming key does not exist",
				{
					keyName: name,
					err: normalizeError(err),
				}
			);
			return false;
		}
	}

	async deleteKey(name: string): Promise<void> {
		await this._http.deleteKey(name);
	}

	destroy(): void {
		// no-op: HttpClient has no connection state to clean up
	}
}
