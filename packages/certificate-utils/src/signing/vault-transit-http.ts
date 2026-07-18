import { HttpClient } from "@trading-model/common/config/http-client";
import {
	type AuthToken,
	DurationMs,
	URLString,
} from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";

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

export enum HashAlgorithm {
	Sha256 = "sha256",
	Sha384 = "sha384",
	Sha512 = "sha512",
	Sha1 = "sha1",
}

const HASH_ALGORITHM_VAULT_MAP: Record<HashAlgorithm, string> = {
	[HashAlgorithm.Sha256]: "sha2-256",
	[HashAlgorithm.Sha384]: "sha2-384",
	[HashAlgorithm.Sha512]: "sha2-512",
	[HashAlgorithm.Sha1]: "sha1",
};

function _getHashAlgorithm(algorithm: HashAlgorithm): string {
	return HASH_ALGORITHM_VAULT_MAP[algorithm] ?? "sha2-256";
}

function _getSignatureString(result: { data: { signature: string } }): string {
	const raw = result.data.signature;
	const colonIdx = raw.lastIndexOf(":");
	return colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
}

function _getLatestKeyVersion(
	name: string,
	keys: Record<string, string>
): string {
	const versions = Object.keys(keys);
	if (versions.length === 0) {
		throw new Error(`Key "${name}" has no versions`);
	}
	const sorted = versions.sort((_prev, _next) => Number(_next) - Number(_prev));
	return keys[sorted[0]];
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

	getHashAlgorithm(algorithm: HashAlgorithm): string {
		return _getHashAlgorithm(algorithm);
	}

	getSignatureString(result: { data: { signature: string } }): string {
		return _getSignatureString(result);
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
		return _getLatestKeyVersion(name, result.data.keys);
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
