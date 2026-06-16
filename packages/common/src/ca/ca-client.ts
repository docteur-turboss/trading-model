import { HttpClient } from '../config/http-client';

export interface CaClientConfig {
  baseUrl: string;
  tls?: {
    ca: string;
    cert: string;
    key: string;
  };
}

export interface SignCertificateRequest {
  serviceId: string;
  csr: string;
  ttlMs?: number;
  bootstrapToken?: string;
}

export interface SignCertificateResponse {
  cert: string;
  caPem: string;
  serialNumber: string;
  expiresAt: string;
  fingerprint: string;
}

export interface GetCertificateResponse {
  cert: string;
  caPem: string;
  serialNumber: string;
  issuedAt: string;
  expiresAt: string;
  fingerprint: string;
}

export class CaClient {
  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;

  /**
   * @param config - Base URL for the CA service and optional TLS paths for mTLS connections.
   */
  constructor(config: CaClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.httpClient = config.tls
      ? HttpClient.createWithTls({
          RootCACertPath: config.tls.ca,
          CertificatePath: config.tls.cert,
          KeyCertificatePath: config.tls.key,
        })
      : new HttpClient();
  }

  /**
   * Submits a Certificate Signing Request (CSR) to the CA service.
   * Returns the signed certificate, CA PEM, and metadata.
   *
   * @param serviceId - Logical service name requesting the certificate.
   * @param csr - PEM-encoded CSR.
   * @param options - Optional TTL and bootstrap token for initial provisioning.
   */
  async signCertificate(
    serviceId: string,
    csr: string,
    options?: { ttlMs?: number; bootstrapToken?: string }
  ): Promise<SignCertificateResponse> {
    const body: Record<string, unknown> = { serviceId, csr };
    if (options?.ttlMs) body.ttlMs = options.ttlMs;
    if (options?.bootstrapToken) body.bootstrapToken = options.bootstrapToken;

    const result = await this.httpClient.post<SignCertificateResponse>(
      `${this.baseUrl}/api/v1/certificate/sign`,
      body
    );

    if (!result) throw new Error('Empty response from CA sign endpoint');
    return result;
  }

  /**
   * Retrieves the current certificate for a service from the CA.
   * Returns null when no certificate has been issued yet (204 No Content).
   */
  async getCertificate(serviceId: string): Promise<GetCertificateResponse | null> {
    const result = await this.httpClient.get<GetCertificateResponse>(
      `${this.baseUrl}/api/v1/certificate/${encodeURIComponent(serviceId)}`
    );

    return result ?? null;
  }

  /**
   * Revokes a previously issued certificate by serial number.
   *
   * @param serialNumber - Serial number of the certificate to revoke.
   * @param reason - Human-readable reason for revocation.
   */
  async revokeCertificate(serialNumber: string, reason: string): Promise<void> {
    await this.httpClient.post(`${this.baseUrl}/api/v1/certificate/revoke`, {
      serialNumber,
      reason,
    });
  }
}
