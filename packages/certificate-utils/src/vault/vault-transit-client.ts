import { logger } from "@trading-model/common/config/logger";
import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";
import { normalizeError } from "@trading-model/common/utils/errors";

import {
	HashAlgorithmMapper,
	VaultResponseParser,
	type VaultTransitConfig,
	VaultTransitHttp,
} from "./vault-transit-http";

export type { VaultTransitConfig } from "./vault-transit-http";

export interface SignRequest {
	keyName: string;
	algorithm: string;
	input: string;
}

export class VaultTransitClient {
	private readonly _http: VaultTransitHttp;
	private readonly _algorithmMapper: HashAlgorithmMapper;
	private readonly _responseParser: VaultResponseParser;

	constructor(config: VaultTransitConfig) {
		this._http = new VaultTransitHttp(config);
		this._algorithmMapper = new HashAlgorithmMapper();
		this._responseParser = new VaultResponseParser();
	}

	async createKey(
		name: string,
		keyType: "rsa-4096" | "ecdsa-p384"
	): Promise<void> {
		const vaultKeyType = keyType === "rsa-4096" ? "rsa-4096" : "ecdsa-p384";
		await this._http.createKey(name, vaultKeyType);
	}

	async sign(request: SignRequest): Promise<string> {
		const { keyName, algorithm, input } = request;
		const result = await this._http.postSign(keyName, {
			input: Buffer.from(input, CryptoAlg.UTF8).toString("base64"),
			hash_algorithm: this._algorithmMapper.getHashAlgorithm(algorithm),
		});
		return this._responseParser.getSignatureString(result);
	}

	async signBytes(name: string, derBytes: string): Promise<string> {
		const result = await this._http.postSign(name, {
			input: Buffer.from(derBytes, "binary").toString("base64"),
			hash_algorithm: "sha2-256",
		});
		const signatureBase64 = this._responseParser.getSignatureString(result);
		return Buffer.from(signatureBase64, "base64").toString("binary");
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
