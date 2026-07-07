import { HttpClient } from "@trading-model/common/config/http-client";
import type { TlsPaths as TlsClientPaths } from "@trading-model/common/domain/tls-paths";

import type { CsrOptions } from "./create-csr";
import { KeyAlgorithm } from "./generate-key-pair";
import { KeyPairClient } from "./key-pair-client";
import type { SignOptions } from "./sign-certificate";
import type {
	KeyPair,
	KeyPairWithId,
	SignedCertificate,
	SignInput,
} from "./types";
import type {
	CertificateValidationInput,
	ValidationResult,
} from "./validate-certificate";

export interface RemoteSigningConfig {
	baseUrl: string;
	tls?: TlsClientPaths;
	timeoutMs?: number;
}

export class RemoteSigningClient {
	private readonly _httpClient: HttpClient;
	private readonly _baseUrl: string;
	private readonly _timeoutMs: number;
	private readonly _keyPairClient: KeyPairClient;

	constructor(config: RemoteSigningConfig) {
		this._baseUrl = config.baseUrl.replace(/\/+$/, "");
		this._timeoutMs = config.timeoutMs ?? 30000;
		this._httpClient = config.tls
			? HttpClient.createWithTls(config.tls)
			: new HttpClient();
		this._keyPairClient = new KeyPairClient(
			this._httpClient,
			this._baseUrl,
			this._timeoutMs
		);
	}

	async generateKeyPair(
		algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
	): Promise<KeyPair> {
		return this._keyPairClient.generateKeyPair(algorithm);
	}

	async generateKeyPairWithId(
		algorithm: KeyAlgorithm = KeyAlgorithm.ecP384
	): Promise<KeyPairWithId> {
		return this._keyPairClient.generateKeyPairWithId(algorithm);
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

	async validateCertificate(
		input: CertificateValidationInput
	): Promise<ValidationResult> {
		const result = await this._httpClient.post<ValidationResult>(
			`${this._baseUrl}/api/v1/crypto/validate-certificate`,
			input,
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

	async sign(input: SignInput): Promise<string> {
		const result = await this._httpClient.post<string>(
			`${this._baseUrl}/api/v1/crypto/sign`,
			input,
			{ timeoutMs: this._timeoutMs }
		);
		if (result === undefined) {
			throw new Error("Empty response from remote signer");
		}
		return result;
	}
}
