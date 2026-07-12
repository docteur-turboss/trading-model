import { HttpClient } from "@trading-model/common/config/http-client";
import { DurationMs, URLString } from "@trading-model/common/domain/primitives";
import type { TlsPaths as TlsClientPaths } from "@trading-model/common/domain/tls-paths";
import { KeyAlgorithm } from "../keygen/generate-key-pair";
import { KeyPairClient } from "../keygen/key-pair-client";
import type {
	KeyPair,
	KeyPairWithId,
	SignedCertificate,
	SignInput,
} from "../keygen/types";
import type {
	CertificateValidationInput,
	ValidationResult,
} from "../validation/validate-certificate";
import type { CsrOptions } from "./create-csr";
import type { SignOptions } from "./sign-certificate";

export interface RemoteSigningConfig {
	baseUrl: URLString;
	tls?: TlsClientPaths;
	timeoutMs?: DurationMs;
}

export class RemoteSigningClient {
	private readonly _httpClient: HttpClient;
	private readonly _baseUrl: URLString;
	private readonly _timeoutMs: DurationMs;
	private readonly _keyPairClient: KeyPairClient;

	constructor(config: RemoteSigningConfig) {
		this._baseUrl = URLString.of(config.baseUrl.replace(/\/+$/, ""));
		this._timeoutMs = config.timeoutMs ?? DurationMs.of(30000);
		this._httpClient = config.tls
			? HttpClient.createWithTls(config.tls)
			: new HttpClient();
		this._keyPairClient = new KeyPairClient({
			httpClient: this._httpClient,
			baseUrl: this._baseUrl,
			timeoutMs: this._timeoutMs,
		});
	}

	generateKeyPair(
		algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
	): Promise<KeyPair> {
		return this._keyPairClient.generateKeyPair(algorithm);
	}

	generateKeyPairWithId(
		algorithm: KeyAlgorithm = KeyAlgorithm.EcP384
	): Promise<KeyPairWithId> {
		return this._keyPairClient.generateKeyPairWithId(algorithm);
	}

	private async _postAndCheck<TValue>(
		path: string,
		body: Record<string, unknown>
	): Promise<TValue> {
		const result = await this._httpClient.post<TValue>(
			URLString.of(`${this._baseUrl}${path}`),
			body,
			{ timeoutMs: this._timeoutMs }
		);
		if (result === undefined || result === null) {
			throw new Error("Empty response from remote signer");
		}
		return result;
	}

	signCertificate(options: SignOptions): Promise<SignedCertificate> {
		return this._postAndCheck<SignedCertificate>(
			"/api/v1/crypto/sign-certificate",
			options as unknown as Record<string, unknown>
		);
	}

	createCsr(options: CsrOptions): Promise<string> {
		return this._postAndCheck<string>(
			"/api/v1/crypto/create-csr",
			options as unknown as Record<string, unknown>
		);
	}

	validateCertificate(
		input: CertificateValidationInput
	): Promise<ValidationResult> {
		return this._postAndCheck<ValidationResult>(
			"/api/v1/crypto/validate-certificate",
			input as unknown as Record<string, unknown>
		);
	}

	parseKey(privateKey: string): Promise<KeyPair> {
		return this._postAndCheck<KeyPair>("/api/v1/crypto/parse-key", {
			privateKey,
		});
	}

	sign(input: SignInput): Promise<string> {
		return this._postAndCheck<string>(
			"/api/v1/crypto/sign",
			input as unknown as Record<string, unknown>
		);
	}
}
