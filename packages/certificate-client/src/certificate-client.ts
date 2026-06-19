import fs from 'node:fs/promises';
import path from 'node:path';

import { generateKeyPairAsync, createCsrAsync } from '@trading-model/certificate-utils/async';
import { KeyAlgorithm } from '@trading-model/certificate-utils/generate-key-pair';
import { CaClient } from '@trading-model/common/ca/ca-client';
import { logger } from '@trading-model/common/config/logger';

export interface CertificateClientConfig {
  caUrl: string;
  serviceId: string;
  commonName: string;
  san: string[];
  certPath: string;
  keyPath: string;
  caPath: string;
  bootstrapToken?: string;
  keyAlgorithm?: KeyAlgorithm;
  renewMarginMs?: number;
  tls?: {
    ca: string;
    cert: string;
    key: string;
  };
  onRenew?: (cert: ObtainedCertificate) => void;
}

export interface ObtainedCertificate {
  certPem: string;
  keyPem: string;
  caPem: string;
  serialNumber: string;
  expiresAt: Date;
}

export class CertificateClient {
  private readonly config: CertificateClientConfig;
  private readonly caClient: CaClient;
  private obtainedCert: ObtainedCertificate | null = null;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: CertificateClientConfig) {
    this.config = config;
    this.caClient = new CaClient({
      baseUrl: config.caUrl,
      tls: config.tls,
    });
  }

  async obtainCertificate(): Promise<ObtainedCertificate> {
    const keyPair = await generateKeyPairAsync(this.config.keyAlgorithm ?? KeyAlgorithm.EC_P384);
    const csr = await createCsrAsync({
      commonName: this.config.commonName,
      san: this.config.san,
      keyPem: keyPair.privateKey,
    });

    const response = await this.caClient.signCertificate(this.config.serviceId, csr, {
      bootstrapToken: this.config.bootstrapToken,
    });

    const certDir = path.dirname(this.config.certPath);
    await fs.mkdir(certDir, { recursive: true });

    await fs.writeFile(this.config.keyPath, keyPair.privateKey, { mode: 0o600 });
    await fs.writeFile(this.config.certPath, response.cert, { mode: 0o644 });
    await fs.writeFile(this.config.caPath, response.caPem, { mode: 0o644 });

    this.obtainedCert = {
      certPem: response.cert,
      keyPem: keyPair.privateKey,
      caPem: response.caPem,
      serialNumber: response.serialNumber,
      expiresAt: new Date(response.expiresAt),
    };

    logger.info('Certificate obtained', {
      serviceId: this.config.serviceId,
      serialNumber: response.serialNumber,
      expiresAt: response.expiresAt,
    });

    if (this.config.onRenew) {
      const cert = this.obtainedCert;
      const onRenew = this.config.onRenew;
      if (cert && onRenew) {
        setImmediate(() => onRenew(cert));
      }
    }

    return this.obtainedCert;
  }

  startAutoRenew(): void {
    if (this.renewTimer) return;

    const marginMs = this.config.renewMarginMs ?? 86400000;
    this.scheduleRenew(marginMs);
  }

  stopAutoRenew(): void {
    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }
  }

  private async scheduleRenew(marginMs: number): Promise<void> {
    if (!this.obtainedCert) {
      await this.obtainCertificate();
    }

    if (!this.obtainedCert) {
      throw new Error('Failed to obtain certificate');
    }

    const expiresAt = this.obtainedCert.expiresAt.getTime();
    const now = Date.now();
    const remaining = expiresAt - now;

    if (remaining <= marginMs) {
      try {
        await this.obtainCertificate();
      } catch (err) {
        logger.error('Certificate renewal failed', { err });
      }
      this.scheduleRenew(marginMs);
      return;
    }

    const delay = remaining - marginMs;
    this.renewTimer = setTimeout(() => {
      this.obtainCertificate()
        .then(() => this.scheduleRenew(marginMs))
        .catch(err => {
          logger.error('Certificate renewal failed, retrying', { err });
          this.renewTimer = setTimeout(() => this.scheduleRenew(marginMs), 60000);
        });
    }, delay);

    if (this.obtainedCert) {
      logger.info('Certificate renewal scheduled', {
        serviceId: this.config.serviceId,
        delay,
        expiresAt: this.obtainedCert.expiresAt,
      });
    }
  }

  getCurrentCert(): ObtainedCertificate | null {
    return this.obtainedCert;
  }
}
