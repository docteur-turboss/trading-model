import { HttpClient } from "@trading-model/common/config/http-client";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";

export interface VaultTransitConfig {
	vaultUrl: string;
	token: string;
	namespace?: string;
	tls?: TlsPaths;
	timeoutMs?: number;
}

export class VaultTransitClient {
	private readonly _httpClient: HttpClient;
	private readonly _baseUrl: string;
	private readonly _token: string;
	private readonly _namespace: string;
	private readonly _timeoutMs: number;

	constructor(config: VaultTransitConfig) {
		this._baseUrl = config.vaultUrl.replace(/\/+$/, "");
		this._token = config.token;
		this._namespace = config.namespace ?? "";
		this._timeoutMs = config.timeoutMs ?? 30000;
		this._httpClient = config.tls
			? HttpClient.createWithTls(config.tls)
			: new HttpClient();
	}

	async createKey(
		name: string,
		keyType: "rsa-4096" | "ecdsa-p384"
	): Promise<void> {
		const vaultKeyType = keyType === "rsa-4096" ? "rsa-4096" : "ecdsa-p384";
		const createKeyPayload: Record<string, unknown> = {};
		createKeyPayload.type = vaultKeyType;
		createKeyPayload.exportable = false;
		createKeyPayload.allow_plaintext_backup = false;
		await this._httpClient.post(
			`${this._baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`,
			createKeyPayload,
			{ headers: this._getHeaders(), timeoutMs: this._timeoutMs }
		);
	}

	private _extractSignature(result: { data: { signature: string } }): string {
		const raw = result.data.signature;
		const colonIdx = raw.lastIndexOf(":");
		return colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
	}

	async sign(name: string, algorithm: string, input: string): Promise<string> {
		const result = await this._postSign(name, {
			input: Buffer.from(input, "utf8").toString("base64"),
			hash_algorithm: this._toVaultHashAlgorithm(algorithm),
		});
		return this._extractSignature(result);
	}

	async signBytes(name: string, derBytes: string): Promise<string> {
		const result = await this._postSign(name, {
			input: Buffer.from(derBytes, "binary").toString("base64"),
			hash_algorithm: "sha2-256",
		});
		const signatureBase64 = this._extractSignature(result);
		return Buffer.from(signatureBase64, "base64").toString("binary");
	}

	private async _postSign(
		name: string,
		payload: Record<string, unknown>,
	): Promise<{ data: { signature: string } }> {
		const result = await this._httpClient.post<{ data: { signature: string } }>(
			`${this._baseUrl}/v1/transit/sign/${encodeURIComponent(name)}`,
			payload,
			{ headers: this._getHeaders(), timeoutMs: this._timeoutMs },
		);
		if (!result) {
			throw new Error("Empty response from Vault Transit sign");
		}
		return result;
	}

	async readPublicKey(name: string): Promise<string> {
		const result = await this._httpClient.get<{
			data: { keys: Record<string, string> };
		}>(`${this._baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`, {
			headers: this._getHeaders(),
			timeoutMs: this._timeoutMs,
		});
		if (!result) {
			throw new Error(`Key "${name}" not found in Vault Transit`);
		}
		return this._getLatestKeyVersion(name, result.data.keys);
	}

	private _getLatestKeyVersion(name: string, keys: Record<string, string>): string {
		const versions = Object.keys(keys);
		if (versions.length === 0) {
			throw new Error(`Key "${name}" has no versions`);
		}
		const latestVersion = versions.sort((_prev, _next) => Number(_next) - Number(_prev))[0];
		return keys[latestVersion];
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
		await this._httpClient.delete(
			`${this._baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`,
			undefined,
			{ headers: this._getHeaders(), timeoutMs: this._timeoutMs }
		);
	}

	private _getHeaders(): Record<string, string> {
		const headers: Record<string, string> = { "X-Vault-Token": this._token };
		if (this._namespace) {
			headers["X-Vault-Namespace"] = this._namespace;
		}
		return headers;
	}

	destroy(): void {
		// no-op: HttpClient has no connection state to clean up
	}

	private _toVaultHashAlgorithm(algorithm: string): string {
		const map: Record<string, string> = {
			sha256: "sha2-256",
			sha384: "sha2-384",
			sha512: "sha2-512",
			sha1: "sha1",
		};
		return map[algorithm] ?? "sha2-256";
	}
}
