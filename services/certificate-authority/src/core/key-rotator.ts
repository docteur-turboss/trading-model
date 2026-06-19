import { logger } from '@trading-model/common/config/logger';

export interface CaKeyRotator {
  getCurrentKeyId(): string;
  getKeyVersion(): number;
  rotateKey(): Promise<string>;
  cleanupKeyHistory(retentionCount: number): Promise<void>;
}

export interface KeyRotatorOptions {
  ca: CaKeyRotator;
  intervalMs: number;
  retentionCount: number;
}

export class KeyRotator {
  private readonly options: KeyRotatorOptions;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: KeyRotatorOptions) {
    this.options = options;
  }

  start(): void {
    if (this.timer) return;

    logger.info('Starting CA key rotator', {
      intervalMs: this.options.intervalMs,
      retentionCount: this.options.retentionCount,
    });

    this.timer = setInterval(() => {
      this.rotate().catch(err => {
        logger.error('CA key rotation failed', { err });
      });
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('CA key rotator stopped');
    }
  }

  private async rotate(): Promise<void> {
    const previousKeyId = this.options.ca.getCurrentKeyId();
    const previousVersion = this.options.ca.getKeyVersion();

    const newKeyId = await this.options.ca.rotateKey();
    await this.options.ca.cleanupKeyHistory(this.options.retentionCount);

    logger.info('CA key rotated', {
      previousKeyId,
      previousVersion,
      newKeyId,
      newVersion: this.options.ca.getKeyVersion(),
    });
  }
}
