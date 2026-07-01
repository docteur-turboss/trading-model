import { logger } from '@trading-model/common/config/logger';

interface PersistenceOp {
  fn: () => Promise<void>;
  retries: number;
  label: string;
}

/**
 * Self-contained retry queue for persistence operations (subscribe/unsubscribe).
 * Manages its own timer, batch flush, and per-operation retry tracking.
 */
export class PersistenceRetryQueue {
  private ops: PersistenceOp[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly maxRetries: number,
    private readonly retryIntervalMs: number
  ) {}

  enqueue(fn: () => Promise<void>, label: string): void {
    this.ops.push({ fn, retries: 0, label });
    this.ensureStarted();
  }

  private ensureStarted(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.flush().catch(() => {});
    }, this.retryIntervalMs);
    this.timer.unref();
  }

  async flush(): Promise<void> {
    if (this.ops.length === 0) {
      this.stop();
      return;
    }
    const batch = this.ops;
    this.ops = [];
    const failed: PersistenceOp[] = [];
    for (const op of batch) {
      try {
        await op.fn();
      } catch {
        if (op.retries < this.maxRetries) {
          failed.push({ ...op, retries: op.retries + 1 });
        } else {
          logger.error('Persistence operation failed after max retries — giving up', {
            label: op.label,
          });
        }
      }
    }
    if (failed.length > 0) {
      this.ops.push(...failed);
    }
    if (this.ops.length === 0) {
      this.stop();
    }
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}
