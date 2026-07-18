import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";

import { getHashAlgorithm, getSignatureString } from "./vault-response-parser";
import {
	type HashAlgorithm,
	type VaultTransitConfig,
	VaultTransitHttp,
} from "./vault-transit-http";

export type { VaultTransitConfig } from "./vault-transit-http";

export interface SignRequest {
	keyName: string;
	algorithm: HashAlgorithm;
	input: string;
}

export class VaultTransitClient {
	private readonly _http: VaultTransitHttp;

	constructor(config: VaultTransitConfig) {
		this._http = new VaultTransitHttp(config);
	}

	async createKey(
		name: string,
		keyType: "rsa-4096" | "ecdsa-p384"
	): Promise<void> {
		await this._http.createKey(
			name,
			keyType as import("./vault-transit-http").VaultKeyType
		);
	}

	async sign(request: SignRequest): Promise<string> {
		const { keyName, algorithm, input } = request;
		const result = await this._http.postSign(keyName, {
			input: Buffer.from(input, CryptoAlg.UTF8).toString("base64"),
			hash_algorithm: getHashAlgorithm(algorithm),
		});
		return getSignatureString(result);
	}

	async signBytes(name: string, derBytes: Buffer): Promise<Buffer> {
		const result = await this._http.postSign(name, {
			input: derBytes.toString("base64"),
			hash_algorithm: "sha2-256",
		});
		const signatureBase64 = getSignatureString(result);
		return Buffer.from(signatureBase64, "base64");
	}

	readPublicKey(name: string): Promise<string> {
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

	destroy(): void {}
}
