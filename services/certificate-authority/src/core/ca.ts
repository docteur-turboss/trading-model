import { createPublicKey, createSign, createHash, randomUUID } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';

import { KeyAlgorithm, generateKeyPair } from '@trading-model/certificate-utils/generate-key-pair';
import { signCertificate, SignOptions } from '@trading-model/certificate-utils/sign-certificate';
import {
  SignedCertificate,
  KeyPair,
  RevokedCertificate,
} from '@trading-model/certificate-utils/types';

import { env } from '../config/env';
import { CaStore } from '../persistence/ca-store';
import { CertificateStore } from '../persistence/certificate-store';
import { CrlStore } from '../persistence/crl-store';

export interface CaOptions {
  caKeyPath: string;
  caCertTtlMs: number;
  certificateStore: CertificateStore;
  crlStore: CrlStore;
  caStore: CaStore;
}

export class CertificateAuthority {
  private caKeyPair: KeyPair | null = null;
  private caCertPem: string = '';
  private readonly options: CaOptions;

  constructor(options: CaOptions) {
    this.options = options;
  }

  async initialize(): Promise<void> {
    await this.loadOrBootstrapCa();
  }

  private async loadOrBootstrapCa(): Promise<void> {
    if (existsSync(this.options.caKeyPath)) {
      const privateKey = readFileSync(this.options.caKeyPath, 'utf8');
      const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
      this.caKeyPair = { publicKey, privateKey };

      const storedCa = await this.options.caStore.getLatest();
      if (storedCa) {
        this.caCertPem = storedCa.caCertPem;
        return;
      }
    }

    await this.bootstrapCa();
  }

  private async bootstrapCa(): Promise<void> {
    this.caKeyPair = generateKeyPair(KeyAlgorithm.RSA_4096);

    const serialNumber = randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.options.caCertTtlMs);

    const certBody = [
      `Serial: ${serialNumber}`,
      `Issuer: CN=TradingModelCA`,
      `Subject: CN=TradingModelCA`,
      `Not Before: ${now.toISOString()}`,
      `Not After: ${expiresAt.toISOString()}`,
      `CA: TRUE`,
      `Public Key: ${this.caKeyPair.publicKey}`,
    ].join('\n');

    const sign = createSign('sha256');
    sign.update(certBody);
    const signature = sign.sign(this.caKeyPair.privateKey, 'base64');

    this.caCertPem = [
      `-----BEGIN CERTIFICATE-----`,
      ...chunks(Buffer.from(JSON.stringify({ body: certBody, signature })).toString('base64'), 64),
      `-----END CERTIFICATE-----`,
    ].join('\n');

    const dir = this.options.caKeyPath.substring(0, this.options.caKeyPath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.options.caKeyPath, this.caKeyPair.privateKey, { mode: 0o600 });

    await this.options.caStore.save({
      id: serialNumber,
      caCertPem: this.caCertPem,
      createdAt: now,
      expiresAt,
      fingerprint: createHash('sha256').update(this.caCertPem).digest('hex'),
    });
  }

  async signServiceCertificate(
    serviceId: string,
    csr: string,
    ttlMs?: number
  ): Promise<SignedCertificate> {
    if (!this.caKeyPair) {
      throw new Error('CA not initialized');
    }

    const options: SignOptions = {
      csr,
      serviceId,
      caKeyPair: this.caKeyPair,
      caCertPem: this.caCertPem,
      ttlMs: ttlMs ?? env.CERT_DEFAULT_TTL_MS,
    };

    const signed = signCertificate(options);

    await this.options.certificateStore.save(signed);

    return signed;
  }

  async revokeCertificate(serialNumber: string, reason: string): Promise<void> {
    const cert = await this.options.certificateStore.getBySerial(serialNumber);
    if (!cert) {
      throw new Error(`Certificate ${serialNumber} not found`);
    }

    const revoked: RevokedCertificate = {
      serialNumber,
      serviceId: cert.serviceId,
      revokedAt: new Date(),
      reason,
    };

    await this.options.crlStore.add(revoked);
  }

  async getCrl(): Promise<RevokedCertificate[]> {
    return this.options.crlStore.getAll();
  }

  getCaCertPem(): string {
    return this.caCertPem;
  }

  isInitialized(): boolean {
    return this.caKeyPair !== null && this.caCertPem.length > 0;
  }
}

function chunks(str: string, size: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    result.push(str.slice(i, i + size));
  }
  return result;
}
