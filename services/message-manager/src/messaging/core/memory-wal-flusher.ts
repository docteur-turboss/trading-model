import { logger } from "@trading-model/common/config/logger";

import { getStreamClient } from "../../config/redis";

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
	private _buffer: MemoryWalEntry[] = [];
	private _flushing = false;
	private _redisDownSince = 0;
	private _backoff = WAL_FLUSH_RETRY_BASE_MS;

	constructor(
		private readonly _prefix: string,
		private readonly _streamMaxlen: number,
		private readonly _messageTtlS: number
	) {}

	push(entries: MemoryWalEntry[]): void {
		this._buffer.push(...entries);
	}

	get bufferSize(): number {
		return this._buffer.length;
	}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
	}

	async flush(): Promise<void> {
		if (this._flushing) {
			return;
		}
		if (
			this._redisDownSince > 0 &&
			Date.now() - this._redisDownSince < MEMORY_WAL_REDIS_RETRY_AFTER_MS
		) {
			return;
		}
		if (this._buffer.length === 0) {
			this._backoff = WAL_FLUSH_RETRY_BASE_MS;
			return;
		}

		this._flushing = true;
		try {
			const batch = this._buffer.splice(0, WAL_BATCH_SIZE);
			const redis = await getStreamClient();
			const multi = redis.multi();
			for (const { topic, serialized } of batch) {
				const key = this._streamKey(topic);
				multi.xadd(
					key,
					"MAXLEN",
					"~",
					this._streamMaxlen,
					"*",
					"data",
					serialized
				);
				multi.expire(key, this._messageTtlS);
			}
			try {
				const results = await multi.exec();
				if (results) {
					const anyFailed = results.some((result) => result[0] !== null);
					if (anyFailed) {
						this._redisDownSince = Date.now();
						this._backoff = Math.min(this._backoff * 2, WAL_FLUSH_RETRY_MAX_MS);
						logger.warn("Memory WAL flush partial failure — re-queuing batch", {
							batchSize: batch.length,
							backoff: this._backoff,
						});
						this._buffer.unshift(...batch);
						await this._sleepWithJitter(this._backoff);
						return;
					}
				}
				this._redisDownSince = 0;
				this._backoff = WAL_FLUSH_RETRY_BASE_MS;
			} catch (err) {
				this._redisDownSince = Date.now();
				this._backoff = Math.min(this._backoff * 2, WAL_FLUSH_RETRY_MAX_MS);
				logger.warn("Memory WAL flush failed — re-queuing batch", {
					batchSize: batch.length,
					backoff: this._backoff,
					error: (err as Error).message,
				});
				this._buffer.unshift(...batch);
				await this._sleepWithJitter(this._backoff);
			}
		} finally {
			this._flushing = false;
		}
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
	}
}
