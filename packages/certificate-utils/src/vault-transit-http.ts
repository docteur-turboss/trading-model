import { HttpClient } from "@trading-model/common/config/http-client";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";

export interface VaultTransitConfig {
	vaultUrl: string;
	token: string;
	namespace?: string;
	tls?: TlsPaths;
	timeoutMs?: number;
}

const HASH_ALGORITHM_MAP: Record<string, string> = { sha256: "sha2-256", sha384: "sha2-384", sha512: "sha2-512", sha1: "sha1" };

export class VaultTransitHttp {
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
		this._httpClient = config.tls ? HttpClient.createWithTls(config.tls) : new HttpClient();
	}
	private _getHeaders(): Record<string, string> {
		const headers: Record<string, string> = { "X-Vault-Token": this._token };
		if (this._namespace) headers[HTTP_HEADERS.X_VAULT_NAMESPACE] = this._namespace;
		return headers;
	}
	async createKey(name: string, vaultKeyType: string): Promise<void> {
		await this._httpClient.post(`${this._baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`, { type: vaultKeyType, exportable: false, allow_plaintext_backup: false }, { headers: this._getHeaders(), timeoutMs: this._timeoutMs });
	}
	async postSign(name: string, payload: Record<string, unknown>): Promise<{ data: { signature: string } }> {
		const result = await this._httpClient.post<{ data: { signature: string } }>(`${this._baseUrl}/v1/transit/sign/${encodeURIComponent(name)}`, payload, { headers: this._getHeaders(), timeoutMs: this._timeoutMs });
		if (!result) throw new Error("Empty response from Vault Transit sign");
		return result;
	}
	getSignatureString(result: { data: { signature: string } }): string {
		const raw = result.data.signature;
		const colonIdx = raw.lastIndexOf(":");
		return colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
	}
	getHashAlgorithm(algorithm: string): string { return HASH_ALGORITHM_MAP[algorithm] ?? "sha2-256"; }
	async readPublicKey(name: string): Promise<string> {
		const result = await this._httpClient.get<{ data: { keys: Record<string, string> } }>(`${this._baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`, { headers: this._getHeaders(), timeoutMs: this._timeoutMs });
		if (!result) throw new Error(`Key "${name}" not found in Vault Transit`);
		return this._getLatestKeyVersion(name, result.data.keys);
	}
	private _getLatestKeyVersion(name: string, keys: Record<string, string>): string {
		const versions = Object.keys(keys);
		if (versions.length === 0) throw new Error(`Key "${name}" has no versions`);
		return keys[versions.sort((_prev, _next) => Number(_next) - Number(_prev))[0]];
	}
	async deleteKey(name: string): Promise<void> {
		await this._httpClient.delete(`${this._baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`, undefined, { headers: this._getHeaders(), timeoutMs: this._timeoutMs });
	}
}
