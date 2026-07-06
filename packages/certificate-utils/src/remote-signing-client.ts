import { HttpClient } from "@trading-model/common/config/http-client";
import type { TlsPaths as TlsClientPaths } from "@trading-model/common/domain/tls-paths";

import type { CsrOptions } from "./create-csr";
import { KeyAlgorithm } from "./generate-key-pair";
import type { SignOptions } from "./sign-certificate";
import type { KeyPair, KeyPairWithId, SignedCertificate } from "./types";
import type { ValidationResult } from "./validate-certificate";

export interface RemoteSigningConfig {
	baseUrl: string;
	tls?: TlsClientPaths;
	timeoutMs?: number;
}

export class RemoteSigningClient {
	private readonly _httpClient: HttpClient;
	private readonly _baseUrl: string;
	private readonly _timeoutMs: number;

	constructor(config: RemoteSigningConfig) {
		this._baseUrl = config.baseUrl.replace(/\/+$/, "");
		this._timeoutMs = config.timeoutMs ?? 30000;
		this._httpClient = config.tls
			? HttpClient.createWithTls(config.tls)
			: new HttpClient();
	}

	async generateKeyPair(
		algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
	): Promise<KeyPair> {
		const result = await this._httpClient.post<KeyPair>(
			`${this._baseUrl}/api/v1/crypto/generate-key-pair`,
			{ algorithm },
			{ timeoutMs: this._timeoutMs }
		);
		if (!result) {
			throw new Error("Empty response from remote signer");
		}
		return result;
	}

	async generateKeyPairWithId(
		algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
	): Promise<KeyPairWithId> {
		const result = await this._httpClient.post<KeyPairWithId>(
			`${this._baseUrl}/api/v1/crypto/generate-key-pair-with-id`,
			{ algorithm },
			{ timeoutMs: this._timeoutMs }
		);
		if (!result) {
			throw new Error("Empty response from remote signer");
		}
		return result;
	}

	async signCertificate(options: SignOptions): Promise<SignedCertificate> {
		const result = await this._httpClient.post<SignedCertificate>(
			`${this._baseUrl}/api/v1/crypto/sign-certificate`,
			options as unknown as Record<string, unknown>,
			{ timeoutMs: this._timeoutMs }
		);
		if (!result) {
			throw new Error("Empty response from remote signer");
		}
		return result;
	}

	async createCsr(options: CsrOptions): Promise<string> {
		const result = await this._httpClient.post<string>(
			`${this._baseUrl}/api/v1/crypto/create-csr`,
			options as unknown as Record<string, unknown>,
			{ timeoutMs: this._timeoutMs }
		);
		if (result === undefined) {
			throw new Error("Empty response from remote signer");
		}
		return result;
	}

	async validateCertificate(certPem: string): Promise<ValidationResult> {
		const result = await this._httpClient.post<ValidationResult>(
			`${this._baseUrl}/api/v1/crypto/validate-certificate`,
			{ certPem },
			{ timeoutMs: this._timeoutMs }
		);
		if (!result) {
			throw new Error("Empty response from remote signer");
		}
		return result;
	}

	async parseKey(privateKey: string): Promise<KeyPair> {
		const result = await this._httpClient.post<KeyPair>(
			`${this._baseUrl}/api/v1/crypto/parse-key`,
			{ privateKey },
			{ timeoutMs: this._timeoutMs }
		);
		if (!result) {
			throw new Error("Empty response from remote signer");
		}
		return result;
	}

	async sign(
		algorithm: string,
		body: string,
		privateKey: string
	): Promise<string> {
		const result = await this._httpClient.post<string>(
			`${this._baseUrl}/api/v1/crypto/sign`,
			{ algorithm, body, privateKey },
			{ timeoutMs: this._timeoutMs }
		);
		if (result === undefined) {
			throw new Error("Empty response from remote signer");
		}
		return result;
	}
}
