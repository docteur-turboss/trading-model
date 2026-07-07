import { HttpClient } from "../config/http-client";
import type {
	Fingerprint,
	SerialNumber,
	ServiceId,
} from "../domain/primitives";
import type { RevocationRequest } from "../domain/revocation-request";
import type { TlsPaths } from "../domain/tls-paths";

export interface CaClientConfig {
	baseUrl: string;
	tls?: TlsPaths;
}

export interface SignCertificateRequest {
	serviceId: ServiceId;
	csr: string;
	ttlMs?: number;
	bootstrapToken?: string;
}

/**
 * Fields shared by all certificate response types (wire format).
 * @see CertificateResponse from domain/certificate-base — isomorphic,
 *      uses `certPem` where this type uses `cert`.
 */
export interface CertificateResponse {
	/** @see CertificateBase.certPem */
	cert: string;
	caPem: string;
	serialNumber: SerialNumber;
	expiresAt: string;
	fingerprint: Fingerprint;
}

export interface SignCertificateResponse extends CertificateResponse {}

export interface GetCertificateResponse extends CertificateResponse {
	issuedAt: string;
}

/**
 * A single entry in the Certificate Revocation List (wire format).
 * @see RevokedCertificate — domain equivalent with `revokedAt: Date`.
 */
export interface CrlEntry {
	serialNumber: SerialNumber;
	serviceId: ServiceId;
	revokedAt: string;
	reason: string;
}

export class CaClient {
	private readonly _httpClient: HttpClient;
	private readonly _baseUrl: string;

	/**
	 * @param config - Base URL for the CA service and optional TLS paths for mTLS connections.
	 */
	constructor(config: CaClientConfig) {
		this._baseUrl = config.baseUrl.replace(/\/+$/, "");
		this._httpClient = config.tls
			? HttpClient.createWithTls(config.tls)
			: new HttpClient();
	}

	/**
	 * Submits a Certificate Signing Request (CSR) to the CA service.
	 * Returns the signed certificate, CA PEM, and metadata.
	 */
	async signCertificate(
		request: SignCertificateRequest
	): Promise<SignCertificateResponse> {
		const { serviceId, csr, ttlMs, bootstrapToken } = request;
		const body: Record<string, unknown> = { serviceId, csr };
		if (ttlMs) {
			body.ttlMs = ttlMs;
		}
		if (bootstrapToken) {
			body.bootstrapToken = bootstrapToken;
		}

		const result = await this._httpClient.post<SignCertificateResponse>(
			`${this._baseUrl}/api/v1/certificate/sign`,
			body
		);

		if (!result) {
			throw new Error("Empty response from CA sign endpoint");
		}
		return result;
	}

	/**
	 * Retrieves the current certificate for a service from the CA.
	 * Returns null when no certificate has been issued yet (204 No Content).
	 */
	async getCertificate(
		serviceId: ServiceId
	): Promise<GetCertificateResponse | null> {
		const result = await this._httpClient.get<GetCertificateResponse>(
			`${this._baseUrl}/api/v1/certificate/${encodeURIComponent(serviceId)}`
		);

		return result ?? null;
	}

	/**
	 * Revokes a previously issued certificate by serial number.
	 *
	 * @param request - The serial number and reason for revocation.
	 */
	async revokeCertificate(request: RevocationRequest): Promise<void> {
		await this._httpClient.post(
			`${this._baseUrl}/api/v1/certificate/revoke`,
			request
		);
	}

	/**
	 * Retrieves the Certificate Revocation List (CRL) from the CA.
	 *
	 * @param since - Optional timestamp to filter entries after a given time.
	 */
	async getCrl(since?: string): Promise<CrlEntry[]> {
		const url = since
			? `${this._baseUrl}/api/v1/crl?since=${encodeURIComponent(since)}`
			: `${this._baseUrl}/api/v1/crl`;
		const result = await this._httpClient.get<CrlEntry[]>(url);
		return result ?? [];
	}
}
