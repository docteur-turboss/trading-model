import { HttpClient } from '@trading-model/common/config/http-client';
import { TlsClientPaths } from '@trading-model/common/config/http-client';

import { CsrOptions } from './create-csr';
import { KeyAlgorithm } from './generate-key-pair';
import { SignOptions } from './sign-certificate';
import { KeyPair, KeyPairWithId, SignedCertificate } from './types';
import { ValidationResult } from './validate-certificate';

export interface RemoteSigningConfig {
  baseUrl: string;
  tls?: TlsClientPaths;
  timeoutMs?: number;
}

export class RemoteSigningClient {
  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: RemoteSigningConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.httpClient = config.tls
      ? HttpClient.createWithTls(config.tls)
      : new HttpClient();
  }

  async generateKeyPair(algorithm: KeyAlgorithm = KeyAlgorithm.EC_P384): Promise<KeyPair> {
    const result = await this.httpClient.post<KeyPair>(
      `${this.baseUrl}/api/v1/crypto/generate-key-pair`,
      { algorithm },
      { timeoutMs: this.timeoutMs }
    );
    if (!result) throw new Error('Empty response from remote signer');
    return result;
  }

  async generateKeyPairWithId(algorithm: KeyAlgorithm = KeyAlgorithm.EC_P384): Promise<KeyPairWithId> {
    const result = await this.httpClient.post<KeyPairWithId>(
      `${this.baseUrl}/api/v1/crypto/generate-key-pair-with-id`,
      { algorithm },
      { timeoutMs: this.timeoutMs }
    );
    if (!result) throw new Error('Empty response from remote signer');
    return result;
  }

  async signCertificate(options: SignOptions): Promise<SignedCertificate> {
    const result = await this.httpClient.post<SignedCertificate>(
      `${this.baseUrl}/api/v1/crypto/sign-certificate`,
      options as unknown as Record<string, unknown>,
      { timeoutMs: this.timeoutMs }
    );
    if (!result) throw new Error('Empty response from remote signer');
    return result;
  }

  async createCsr(options: CsrOptions): Promise<string> {
    const result = await this.httpClient.post<string>(
      `${this.baseUrl}/api/v1/crypto/create-csr`,
      options as unknown as Record<string, unknown>,
      { timeoutMs: this.timeoutMs }
    );
    if (result === undefined) throw new Error('Empty response from remote signer');
    return result;
  }

  async validateCertificate(certPem: string): Promise<ValidationResult> {
    const result = await this.httpClient.post<ValidationResult>(
      `${this.baseUrl}/api/v1/crypto/validate-certificate`,
      { certPem },
      { timeoutMs: this.timeoutMs }
    );
    if (!result) throw new Error('Empty response from remote signer');
    return result;
  }

  async parseKey(privateKey: string): Promise<KeyPair> {
    const result = await this.httpClient.post<KeyPair>(
      `${this.baseUrl}/api/v1/crypto/parse-key`,
      { privateKey },
      { timeoutMs: this.timeoutMs }
    );
    if (!result) throw new Error('Empty response from remote signer');
    return result;
  }

  async sign(algorithm: string, body: string, privateKey: string): Promise<string> {
    const result = await this.httpClient.post<string>(
      `${this.baseUrl}/api/v1/crypto/sign`,
      { algorithm, body, privateKey },
      { timeoutMs: this.timeoutMs }
    );
    if (result === undefined) throw new Error('Empty response from remote signer');
    return result;
  }
}
