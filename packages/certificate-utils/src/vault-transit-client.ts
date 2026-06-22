import { HttpClient, TlsClientPaths } from '@trading-model/common/config/http-client';
import { logger } from '@trading-model/common/config/logger';
import { normalizeError } from '@trading-model/common/utils/errors';

export interface VaultTransitConfig {
  vaultUrl: string;
  token: string;
  namespace?: string;
  tls?: TlsClientPaths;
  timeoutMs?: number;
}

export class VaultTransitClient {
  private readonly httpClient: HttpClient;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly namespace: string;
  private readonly timeoutMs: number;

  constructor(config: VaultTransitConfig) {
    this.baseUrl = config.vaultUrl.replace(/\/+$/, '');
    this.token = config.token;
    this.namespace = config.namespace ?? '';
    this.timeoutMs = config.timeoutMs ?? 30000;
    this.httpClient = config.tls ? HttpClient.createWithTls(config.tls) : new HttpClient();
  }

  async createKey(name: string, keyType: 'rsa-4096' | 'ecdsa-p384'): Promise<void> {
    const vaultKeyType = keyType === 'rsa-4096' ? 'rsa-4096' : 'ecdsa-p384';
    await this.httpClient.post(
      `${this.baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`,
      { type: vaultKeyType, exportable: false, allow_plaintext_backup: false },
      { headers: this.getHeaders(), timeoutMs: this.timeoutMs }
    );
  }

  async sign(name: string, algorithm: string, input: string): Promise<string> {
    const hashAlgo = this.toVaultHashAlgorithm(algorithm);
    const inputBase64 = Buffer.from(input, 'utf8').toString('base64');
    const result = await this.httpClient.post<{ data: { signature: string } }>(
      `${this.baseUrl}/v1/transit/sign/${encodeURIComponent(name)}`,
      { input: inputBase64, hash_algorithm: hashAlgo },
      { headers: this.getHeaders(), timeoutMs: this.timeoutMs }
    );
    if (!result) throw new Error('Empty response from Vault Transit sign');
    const raw = result.data.signature;
    const colonIdx = raw.lastIndexOf(':');
    return colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
  }

  async signBytes(name: string, derBytes: string): Promise<string> {
    const inputBase64 = Buffer.from(derBytes, 'binary').toString('base64');
    const result = await this.httpClient.post<{ data: { signature: string } }>(
      `${this.baseUrl}/v1/transit/sign/${encodeURIComponent(name)}`,
      { input: inputBase64, hash_algorithm: 'sha2-256' },
      { headers: this.getHeaders(), timeoutMs: this.timeoutMs }
    );
    if (!result) throw new Error('Empty response from Vault Transit sign');
    const raw = result.data.signature;
    const colonIdx = raw.lastIndexOf(':');
    const signatureBase64 = colonIdx >= 0 ? raw.slice(colonIdx + 1) : raw;
    const signature = Buffer.from(signatureBase64, 'base64');
    return signature.toString('binary');
  }

  async readPublicKey(name: string): Promise<string> {
    const result = await this.httpClient.get<{ data: { keys: Record<string, string> } }>(
      `${this.baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`,
      { headers: this.getHeaders(), timeoutMs: this.timeoutMs }
    );
    if (!result) throw new Error(`Key "${name}" not found in Vault Transit`);
    const keys = result.data.keys;
    const versions = Object.keys(keys);
    if (versions.length === 0) throw new Error(`Key "${name}" has no versions`);
    const latestVersion = versions.sort((a, b) => Number(b) - Number(a))[0];
    return keys[latestVersion];
  }

  async keyExists(name: string): Promise<boolean> {
    try {
      await this.readPublicKey(name);
      return true;
    } catch (err) {
      logger.warn('Vault key existence check failed — assuming key does not exist', {
        keyName: name,
        err: normalizeError(err),
      });
      return false;
    }
  }

  async deleteKey(name: string): Promise<void> {
    await this.httpClient.delete(
      `${this.baseUrl}/v1/transit/keys/${encodeURIComponent(name)}`,
      undefined,
      { headers: this.getHeaders(), timeoutMs: this.timeoutMs }
    );
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { 'X-Vault-Token': this.token };
    if (this.namespace) {
      headers['X-Vault-Namespace'] = this.namespace;
    }
    return headers;
  }

  private toVaultHashAlgorithm(algorithm: string): string {
    const map: Record<string, string> = {
      sha256: 'sha2-256',
      sha384: 'sha2-384',
      sha512: 'sha2-512',
      sha1: 'sha1',
    };
    return map[algorithm] ?? 'sha2-256';
  }
}
