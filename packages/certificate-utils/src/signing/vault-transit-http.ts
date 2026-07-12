import { HttpClient } from "@trading-model/common/config/http-client";
import { DurationMs, URLString } from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";

export interface VaultTransitConfig {
	vaultUrl: URLString;
	token: string;
	namespace?: string;
	tls?: TlsPaths;
	timeoutMs?: DurationMs;
}

export class HashAlgorithmMapper {
	getHashAlgorithm(algorithm: string): string {
		const map: Record<string, string> = {
			sha256: "sha2-256",
			sha384: "sha2-384",
			sha512: "sha2-512",
			sha1: "sha1",
		};
		return map[algorithm] ?? "sha2-256";
	}
}

export class VaultResponseParser {
	getSignatureString(result: { data: { signature: string } }): string {
		const raw = result.data.signature;
		const colonIdx = raw.lastIndexOf(":");
		return colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
	}
}

export class KeyVersionManager {
	getLatestKeyVersion(name: string, keys: Record<string, string>): string {
		const versions = Object.keys(keys);
		if (versions.length === 0) {
			throw new Error(`Key "${name}" has no versions`);
		}
		const sorted = versions.sort(
			(_prev, _next) => Number(_next) - Number(_prev)
		);
		return keys[sorted[0]];
	}
}

export class VaultTransitHttp {
	private readonly _httpClient: HttpClient;
	private readonly _baseUrl: URLString;
	private readonly _token: string;
	private readonly _namespace: string;
	private readonly _timeoutMs: DurationMs;
	private readonly _algorithmMapper: HashAlgorithmMapper;
	private readonly _responseParser: VaultResponseParser;
	private readonly _keyVersionManager: KeyVersionManager;

	constructor(config: VaultTransitConfig) {
		this._baseUrl = URLString.of(config.vaultUrl.replace(/\/+$/, ""));
		this._token = config.token;
		this._namespace = config.namespace ?? "";
		this._timeoutMs = config.timeoutMs ?? DurationMs.of(30000);
		this._httpClient = config.tls
			? HttpClient.createWithTls(config.tls)
			: new HttpClient();
		this._algorithmMapper = new HashAlgorithmMapper();
		this._responseParser = new VaultResponseParser();
		this._keyVersionManager = new KeyVersionManager();
	}

	getHashAlgorithm(algorithm: string): string {
		return this._algorithmMapper.getHashAlgorithm(algorithm);
	}

	getSignatureString(result: { data: { signature: string } }): string {
		return this._responseParser.getSignatureString(result);
	}

	private _getHeaders(): Record<string, string> {
		const headers: Record<string, string> = { "X-Vault-Token": this._token };
		if (this._namespace) {
			headers[HTTP_HEADERS.X_VAULT_NAMESPACE] = this._namespace;
		}
		return headers;
	}

	async createKey(name: string, vaultKeyType: string): Promise<void> {
		const payload: Record<string, unknown> = {
			type: vaultKeyType,
			exportable: false,
			allow_plaintext_backup: false,
		};
		await this._httpClient.post(
			URLString.of(
				`${this._baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`
			),
			payload,
			{ headers: this._getHeaders(), timeoutMs: this._timeoutMs }
		);
	}

	async postSign(
		name: string,
		payload: Record<string, unknown>
	): Promise<{ data: { signature: string } }> {
		const result = await this._httpClient.post<{ data: { signature: string } }>(
			URLString.of(
				`${this._baseUrl}/v1/transit/sign/${encodeURIComponent(name)}`
			),
			payload,
			{ headers: this._getHeaders(), timeoutMs: this._timeoutMs }
		);
		if (!result) {
			throw new Error("Empty response from Vault Transit sign");
		}
		return result;
	}

	async readPublicKey(name: string): Promise<string> {
		const result = await this._httpClient.get<{
			data: { keys: Record<string, string> };
		}>(
			URLString.of(
				`${this._baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`
			),
			{
				headers: this._getHeaders(),
				timeoutMs: this._timeoutMs,
			}
		);
		if (!result) {
			throw new Error(`Key "${name}" not found in Vault Transit`);
		}
		return this._keyVersionManager.getLatestKeyVersion(name, result.data.keys);
	}

	async deleteKey(name: string): Promise<void> {
		await this._httpClient.delete(
			URLString.of(
				`${this._baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`
			),
			undefined,
			{ headers: this._getHeaders(), timeoutMs: this._timeoutMs }
		);
	}
}
