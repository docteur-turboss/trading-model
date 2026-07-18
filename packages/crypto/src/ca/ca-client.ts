import { HttpClient } from "@trading-model/common/config/http-client";
import type { CertSignRequest } from "@trading-model/common/domain/cert-signing";
import type { CertificateBase } from "@trading-model/common/domain/certificate-base";
import {
	type Fingerprint,
	type ISODateTime,
	type JsonObject,
	type SerialNumber,
	type ServiceId,
	URLString,
} from "@trading-model/common/domain/primitives";
import type {
	RevocationReason,
	RevocationRequest,
} from "@trading-model/common/domain/revocation-request";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";

export interface CaClientConfig {
	baseUrl: URLString;
	tls?: TlsPaths;
}

export type SignCertificateRequest = CertSignRequest;

export interface WireCertificateResponse
	extends Omit<CertificateBase, "expiresAt"> {
	expiresAt: string;
	fingerprint: Fingerprint;
}

export interface GetCertificateResponse extends WireCertificateResponse {
	issuedAt: string;
}

/**
 * A single entry in the Certificate Revocation List (wire format).
 * @see RevokedCertificate — domain equivalent with `revokedAt: Date`.
 */
export interface CrlEntry {
	serialNumber: SerialNumber;
	serviceId: ServiceId;
	revokedAt: ISODateTime;
	reason: RevocationReason;
}

export class CaClient {
	private readonly _httpClient: HttpClient;
	private readonly _baseUrl: URLString;

	/**
	 * @param config - Base URL for the CA service and optional TLS paths for mTLS connections.
	 */
	constructor(config: CaClientConfig) {
		this._baseUrl = URLString.of(config.baseUrl.replace(/\/+$/, ""));
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
	): Promise<WireCertificateResponse> {
		const { serviceId, csr, ttlMs, bootstrapToken } = request;
		const body: JsonObject = { serviceId, csr };
		if (ttlMs) {
			body.ttlMs = ttlMs;
		}
		if (bootstrapToken) {
			body.bootstrapToken = bootstrapToken;
		}

		const result = await this._httpClient.post<WireCertificateResponse>(
			URLString.of(`${this._baseUrl}/api/v1/certificate/sign`),
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
			URLString.of(
				`${this._baseUrl}/api/v1/certificate/${encodeURIComponent(serviceId)}`
			)
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
			URLString.of(`${this._baseUrl}/api/v1/certificate/revoke`),
			request
		);
	}

	/**
	 * Retrieves the Certificate Revocation List (CRL) from the CA.
	 *
	 * @param since - Optional timestamp to filter entries after a given time.
	 */
	async getCrl(since?: string): Promise<CrlEntry[]> {
		const url: URLString = URLString.of(
			since
				? `${this._baseUrl}/api/v1/crl?since=${encodeURIComponent(since)}`
				: `${this._baseUrl}/api/v1/crl`
		);
		const result = await this._httpClient.get<CrlEntry[]>(url);
		return result ?? [];
	}
}
