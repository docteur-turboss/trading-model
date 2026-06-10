import { logger } from '@trading-model/common/config/logger';

import { CertificateAuthority } from './ca';
import { CertificateStore } from '../persistence/certificate-store';

export interface RotatorOptions {
  ca: CertificateAuthority;
  certificateStore: CertificateStore;
  intervalMs: number;
  marginMs: number;
  defaultTtlMs: number;
}

export class Rotator {
  private readonly options: RotatorOptions;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RotatorOptions) {
    this.options = options;
  }

  start(): void {
    if (this.timer) {
      return;
    }

    logger.info('Starting certificate rotator', {
      intervalMs: this.options.intervalMs,
      marginMs: this.options.marginMs,
    });

    this.timer = setInterval(() => {
      this.rotate().catch(err => {
        logger.error('Certificate rotation failed', { err });
      });
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('Certificate rotator stopped');
    }
  }

  private async rotate(): Promise<void> {
    const expiringCerts = await this.options.certificateStore.getExpiring(this.options.marginMs);

    if (expiringCerts.length === 0) {
      return;
    }

    logger.info('Rotating expiring certificates', { count: expiringCerts.length });

    for (const cert of expiringCerts) {
      try {
        logger.info('Rotating certificate', {
          serviceId: cert.serviceId,
          serialNumber: cert.serialNumber,
          expiresAt: cert.expiresAt,
        });
      } catch (err) {
        logger.error('Failed to rotate certificate', {
          serviceId: cert.serviceId,
          serialNumber: cert.serialNumber,
          err,
        });
      }
    }
  }
}
