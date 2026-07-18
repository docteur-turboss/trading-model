import { HttpClient } from "@trading-model/common/config/http-client";
import {
	type AuthToken,
	DurationMs,
	URLString,
} from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import { getLatestKeyVersion } from "./vault-response-parser";

export { HashAlgorithm } from "./vault-response-parser";

export enum VaultKeyType {
	Rsa2048 = "rsa-2048",
	Rsa4096 = "rsa-4096",
	EcdsaP256 = "ecdsa-p256",
	EcdsaP384 = "ecdsa-p384",
	Ed25519 = "ed25519",
}

export interface VaultTransitConfig {
	vaultUrl: URLString;
	token: AuthToken;
	namespace?: string;
	tls?: TlsPaths;
	timeoutMs?: DurationMs;
}

export class VaultTransitHttp {
	private readonly _httpClient: HttpClient;
	private readonly _baseUrl: URLString;
	private readonly _token: AuthToken;
	private readonly _namespace: string;
	private readonly _timeoutMs: DurationMs;

	constructor(config: VaultTransitConfig) {
		this._baseUrl = URLString.of(config.vaultUrl.replace(/\/+$/, ""));
		this._token = config.token;
		this._namespace = config.namespace ?? "";
		this._timeoutMs = config.timeoutMs ?? DurationMs.of(30000);
		this._httpClient = config.tls
			? HttpClient.createWithTls(config.tls)
			: new HttpClient();
	}

	private _getHeaders(): Record<string, string> {
		const headers: Record<string, string> = { "X-Vault-Token": this._token };
		if (this._namespace) {
			headers[HTTP_HEADERS.X_VAULT_NAMESPACE] = this._namespace;
		}
		return headers;
	}

	async createKey(name: string, vaultKeyType: VaultKeyType): Promise<void> {
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
		return getLatestKeyVersion(name, result.data.keys);
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
