import { logger } from '@trading-model/common/config/logger';

import { getStreamClient } from '../../config/redis';

const WAL_BATCH_SIZE = 50;
const WAL_FLUSH_RETRY_BASE_MS = 100;
const WAL_FLUSH_RETRY_MAX_MS = 10_000;
const MEMORY_WAL_REDIS_RETRY_AFTER_MS = 5_000;

interface MemoryWalEntry {
  topic: string;
  serialized: string;
}

/**
 * Manages the in-memory WAL buffer that accumulates messages before flushing to Redis Streams.
 * Provides backpressure-aware flushing with exponential backoff on Redis failures.
 */
export class MemoryWalFlusher {
  private buffer: MemoryWalEntry[] = [];
  private flushing = false;
  private redisDownSince = 0;
  private backoff = WAL_FLUSH_RETRY_BASE_MS;

  constructor(
    private readonly prefix: string,
    private readonly streamMaxlen: number,
    private readonly messageTtlS: number
  ) {}

  push(entries: MemoryWalEntry[]): void {
    this.buffer.push(...entries);
  }

  get bufferSize(): number {
    return this.buffer.length;
  }

  private streamKey(topic: string): string {
    return `${this.prefix}stream:${topic}`;
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    if (
      this.redisDownSince > 0 &&
      Date.now() - this.redisDownSince < MEMORY_WAL_REDIS_RETRY_AFTER_MS
    )
      return;
    if (this.buffer.length === 0) {
      this.backoff = WAL_FLUSH_RETRY_BASE_MS;
      return;
    }

    this.flushing = true;
    try {
      const batch = this.buffer.splice(0, WAL_BATCH_SIZE);
      const redis = await getStreamClient();
      const multi = redis.multi();
      for (const { topic, serialized } of batch) {
        const key = this.streamKey(topic);
        multi.xadd(key, 'MAXLEN', '~', this.streamMaxlen, '*', 'data', serialized);
        multi.expire(key, this.messageTtlS);
      }
      try {
        const results = await multi.exec();
        if (results) {
          const anyFailed = results.some(r => r[0] !== null);
          if (anyFailed) {
            this.redisDownSince = Date.now();
            this.backoff = Math.min(this.backoff * 2, WAL_FLUSH_RETRY_MAX_MS);
            logger.warn('Memory WAL flush partial failure — re-queuing batch', {
              batchSize: batch.length,
              backoff: this.backoff,
            });
            this.buffer.unshift(...batch);
            await this.sleepWithJitter(this.backoff);
            return;
          }
        }
        this.redisDownSince = 0;
        this.backoff = WAL_FLUSH_RETRY_BASE_MS;
      } catch (err) {
        this.redisDownSince = Date.now();
        this.backoff = Math.min(this.backoff * 2, WAL_FLUSH_RETRY_MAX_MS);
        logger.warn('Memory WAL flush failed — re-queuing batch', {
          batchSize: batch.length,
          backoff: this.backoff,
          error: (err as Error).message,
        });
        this.buffer.unshift(...batch);
        await this.sleepWithJitter(this.backoff);
      }
    } finally {
      this.flushing = false;
    }
  }

  private sleepWithJitter(ms: number): Promise<void> {
    const jitter = ms * 0.2 * (Math.random() * 2 - 1);
    return new Promise(r => setTimeout(r, Math.max(1, Math.round(ms + jitter))));
  }
}
