import { HttpClient } from "@trading-model/common/config/http-client";
import type { TlsPaths as TlsClientPaths } from "@trading-model/common/domain/tls-paths";

import type { CsrOptions } from "./create-csr";
import { KeyAlgorithm } from "../keygen/generate-key-pair";
import { KeyPairClient } from "../keygen/key-pair-client";
import type { SignOptions } from "./sign-certificate";
import type {
	KeyPair,
	KeyPairWithId,
	SignedCertificate,
	SignInput,
} from "../types";
import type {
	CertificateValidationInput,
	ValidationResult,
} from "../validation/validate-certificate";

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

	private async _postAndCheck<TValue>(
		path: string,
		body: Record<string, unknown>
	): Promise<TValue> {
		const result = await this._httpClient.post<TValue>(
			`${this._baseUrl}${path}`,
			body,
			{ timeoutMs: this._timeoutMs }
		);
		if (result === undefined || result === null) {
			throw new Error("Empty response from remote signer");
		}
		return result;
	}

	async signCertificate(options: SignOptions): Promise<SignedCertificate> {
		return this._postAndCheck<SignedCertificate>(
			"/api/v1/crypto/sign-certificate",
			options as unknown as Record<string, unknown>
		);
	}

	async createCsr(options: CsrOptions): Promise<string> {
		return this._postAndCheck<string>(
			"/api/v1/crypto/create-csr",
			options as unknown as Record<string, unknown>
		);
	}

	async validateCertificate(
		input: CertificateValidationInput
	): Promise<ValidationResult> {
		return this._postAndCheck<ValidationResult>(
			"/api/v1/crypto/validate-certificate",
			input as unknown as Record<string, unknown>
		);
	}

	async parseKey(privateKey: string): Promise<KeyPair> {
		return this._postAndCheck<KeyPair>(
			"/api/v1/crypto/parse-key",
			{ privateKey }
		);
	}

	async sign(input: SignInput): Promise<string> {
		return this._postAndCheck<string>(
			"/api/v1/crypto/sign",
			input as unknown as Record<string, unknown>
		);
	}
}
