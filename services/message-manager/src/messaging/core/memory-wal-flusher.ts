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

	private async _buildAndSendBatch(batch: MemoryWalEntry[]): Promise<boolean> {
		const redis = await getStreamClient();
		const multi = redis.multi();
		this._addBatchCommands(multi, batch);
		const results = await multi.exec();
		if (results) {
			return !results.some((result) => result[0] !== null);
		}
		return true;
	}

	private _addBatchCommands(
		multi: ReturnType<import("ioredis").Redis["multi"]>,
		batch: MemoryWalEntry[]
	): void {
		for (const { topic, serialized } of batch) {
			const key = this._streamKey(topic);
			multi.xadd(key, "MAXLEN", "~", this._streamMaxlen, "*", "data", serialized);
			multi.expire(key, this._messageTtlS);
		}
	}

	private _increaseBackoff(): void {
		this._backoff = Math.min(this._backoff * 2, WAL_FLUSH_RETRY_MAX_MS);
	}

	private async _handleFlushFailure(
		batch: MemoryWalEntry[],
		err?: Error
	): Promise<void> {
		this._redisDownSince = Date.now();
		this._increaseBackoff();
		logger.warn(
			err
				? "Memory WAL flush failed — re-queuing batch"
				: "Memory WAL flush partial failure — re-queuing batch",
			{
				batchSize: batch.length,
				backoff: this._backoff,
				...(err ? { error: err.message } : {}),
			}
		);
		this._buffer.unshift(...batch);
		await this._sleepWithJitter(this._backoff);
	}

	async flush(): Promise<void> {
		if (this._shouldSkipFlush()) {
			return;
		}

		this._flushing = true;
		try {
			await this._tryFlushBatch();
		} finally {
			this._flushing = false;
		}
	}

	private _shouldSkipFlush(): boolean {
		if (this._flushing) {
			return true;
		}
		if (this._isInRetryWindow()) {
			return true;
		}
		if (this._buffer.length === 0) {
			this._backoff = WAL_FLUSH_RETRY_BASE_MS;
			return true;
		}
		return false;
	}

	private _isInRetryWindow(): boolean {
		return (
			this._redisDownSince > 0 &&
			Date.now() - this._redisDownSince < MEMORY_WAL_REDIS_RETRY_AFTER_MS
		);
	}

	private async _tryFlushBatch(): Promise<void> {
		const batch = this._buffer.splice(0, WAL_BATCH_SIZE);
		try {
			const ok = await this._buildAndSendBatch(batch);
			if (ok) {
				this._redisDownSince = 0;
				this._backoff = WAL_FLUSH_RETRY_BASE_MS;
				return;
			}
			await this._handleFlushFailure(batch);
		} catch (err) {
			await this._handleFlushFailure(batch, err as Error);
		}
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
	}
}
