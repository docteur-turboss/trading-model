import type Redis from "ioredis";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";

const WAL_BATCH_SIZE = 50;
const WAL_FLUSH_RETRY_BASE_MS = 100;
const WAL_FLUSH_RETRY_MAX_MS = 10_000;
const MEMORY_WAL_REDIS_RETRY_AFTER_MS = 5_000;

interface MemoryWalEntry {
	topic: string;
	serialized: string;
	message: import("@trading-model/common/contracts/message.types").Message;
}

export class MemoryWalFlusher {
	private _flushing = false;
	private _flusherTimer: ReturnType<typeof setInterval> | null = null;
	private _backoff = WAL_FLUSH_RETRY_BASE_MS;
	private _redisDownSince = 0;

	constructor(private readonly _prefix: string) {}

	startFlusher(buffer: MemoryWalEntry[]): void {
		this._flusherTimer = setInterval(() => {
			this.flush(buffer).catch(() => {});
		}, 500);
		this._flusherTimer.unref();
	}

	stopFlusher(): void {
		if (this._flusherTimer) {
			clearInterval(this._flusherTimer);
			this._flusherTimer = null;
		}
	}

	get isFlushing(): boolean {
		return this._flushing;
	}

	get redisDownSince(): number {
		return this._redisDownSince;
	}

	setRedisDown(): void {
		this._redisDownSince = Date.now();
	}

	resetRedisDown(): void {
		this._redisDownSince = 0;
	}

	get backoff(): number {
		return this._backoff;
	}

	resetBackoff(): void {
		this._backoff = WAL_FLUSH_RETRY_BASE_MS;
	}

	increaseBackoff(): void {
		this._backoff = Math.min(this._backoff * 2, WAL_FLUSH_RETRY_MAX_MS);
	}

	isInRetryWindow(): boolean {
		return (
			this._redisDownSince > 0 &&
			Date.now() - this._redisDownSince < MEMORY_WAL_REDIS_RETRY_AFTER_MS
		);
	}

	async flush(buffer: MemoryWalEntry[]): Promise<void> {
		if (this._shouldSkipFlush(buffer)) {
			return;
		}

		this._flushing = true;
		try {
			const { batch, multi } = await this._flushBuffer(buffer);
			try {
				const ok = await this._executeFlushBatch(multi);
				if (ok) {
					this._redisDownSince = 0;
					this._backoff = WAL_FLUSH_RETRY_BASE_MS;
					return;
				}
				await this._handleFlushFailure(batch, undefined, buffer);
			} catch (err) {
				await this._handleFlushFailure(batch, err as Error, buffer);
			}
		} finally {
			this._flushing = false;
		}
	}

	drainAll(buffer: MemoryWalEntry[]): Promise<void> {
		return this.flush(buffer);
	}

	private _shouldSkipFlush(buffer: MemoryWalEntry[]): boolean {
		if (this._flushing) {
			return true;
		}
		if (this.isInRetryWindow()) {
			return true;
		}
		if (buffer.length === 0) {
			this._backoff = WAL_FLUSH_RETRY_BASE_MS;
			return true;
		}
		return false;
	}

	private async _flushBuffer(
		buffer: MemoryWalEntry[]
	): Promise<{ batch: MemoryWalEntry[]; multi: ReturnType<Redis["multi"]> }> {
		const batch = buffer.splice(0, WAL_BATCH_SIZE);
		const redis = await getStreamClient();
		const multi = redis.multi();
		for (const { topic, serialized } of batch) {
			const key = `${this._prefix}stream:${topic}`;
			multi.xadd(key, "MAXLEN", "~", ENV.REDIS_STREAM_MAXLEN, "*", "data", serialized);
			multi.expire(key, ENV.REDIS_MESSAGE_TTL_S);
		}
		return { batch, multi };
	}

	private async _executeFlushBatch(
		multi: ReturnType<Redis["multi"]>
	): Promise<boolean> {
		const results = await multi.exec();
		if (results) {
			return !results.some((resultItem) => resultItem[0] !== null);
		}
		return true;
	}

	private async _handleFlushFailure(
		batch: MemoryWalEntry[],
		err?: Error,
		buffer?: MemoryWalEntry[]
	): Promise<void> {
		this._redisDownSince = Date.now();
		this.increaseBackoff();
		if (err) {
			logger.warn("Memory WAL flush failed — re-queuing batch", {
				batchSize: batch.length,
				backoff: this._backoff,
				error: err.message,
			});
		} else {
			logger.warn("Memory WAL flush partial failure — re-queuing batch", {
				batchSize: batch.length,
				backoff: this._backoff,
			});
		}
		if (buffer) {
			buffer.unshift(...batch);
		}
		await this._sleepWithJitter(this._backoff);
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
	}
}
