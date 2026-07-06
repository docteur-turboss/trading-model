import type { Message } from "@trading-model/common/contracts/message.types";
import { retryFileAppend } from "@trading-model/common/utils/retry-file-append";
import { safeStringify } from "@trading-model/common/utils/safe-stringify";
import type Redis from "ioredis";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { BUFFER_DROPPED_TOTAL } from "../../config/metrics";
import { getStreamClient } from "../../config/redis";

const WAL_BATCH_SIZE = 50;
const WAL_FLUSH_RETRY_BASE_MS = 100;
const WAL_FLUSH_RETRY_MAX_MS = 10_000;
const MEMORY_WAL_REDIS_RETRY_AFTER_MS = 5_000;

interface MemoryWalEntry {
	topic: string;
	serialized: string;
	message: Message;
}

export class MemoryWalBuffer {
	private _buffer: MemoryWalEntry[] = [];
	private _flushing = false;
	private _flusherTimer: ReturnType<typeof setInterval> | null = null;
	private _backoff = WAL_FLUSH_RETRY_BASE_MS;
	private _redisDownSince = 0;
	private readonly _prefix: string;

	constructor(prefix: string) {
		this._prefix = prefix;
	}

	startFlusher(): void {
		this._flusherTimer = setInterval(() => {
			this._flush().catch(() => {});
		}, 500);
		this._flusherTimer.unref();
	}

	stopFlusher(): void {
		if (this._flusherTimer) {
			clearInterval(this._flusherTimer);
			this._flusherTimer = null;
		}
	}

	get length(): number {
		return this._buffer.length;
	}

	push(topic: string, serialized: string, message: Message): void {
		this._warnIfNearCapacity();
		if (this._buffer.length >= ENV.MEMORY_WAL_BUFFER_SIZE) {
			this._evictExcess();
		}
		this._buffer.push({ topic, serialized, message });
	}

	private _warnIfNearCapacity(): void {
		const warnThreshold = Math.floor(
			ENV.MEMORY_WAL_BUFFER_SIZE * ENV.MEMORY_WAL_BUFFER_WARN_PCT
		);
		if (this._buffer.length >= warnThreshold) {
			logger.warn("In-memory WAL buffer approaching capacity", { context: {
				bufferSize: this._buffer.length,
				maxSize: ENV.MEMORY_WAL_BUFFER_SIZE,
				threshold: ENV.MEMORY_WAL_BUFFER_WARN_PCT,
			} });
		}
	}

	drainAll(): Promise<void> {
		return this._flush();
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
	}

	private async _flush(): Promise<void> {
		if (this._shouldSkipFlush()) {
			return;
		}

		this._flushing = true;
		try {
			await this._flushBatch();
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

	private async _flushBatch(): Promise<void> {
		const { batch, multi } = await this._buildFlushBatch();
		try {
			const ok = await this._executeFlushBatch(multi);
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

	private async _buildFlushBatch() {
		const batch = this._buffer.splice(0, WAL_BATCH_SIZE);
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
		err?: Error
	): Promise<void> {
		this._redisDownSince = Date.now();
		this._backoff = Math.min(this._backoff * 2, WAL_FLUSH_RETRY_MAX_MS);
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
		this._buffer.unshift(...batch);
		await this._sleepWithJitter(this._backoff);
	}

	private async _evictExcess(): Promise<void> {
		const { excess, removed } = this._spliceExcess();
		BUFFER_DROPPED_TOTAL.inc(
			{ buffer: "memory-wal", reason: "buffer-full" },
			excess
		);

		const saved = await this._trySaveToRedis(removed);
		if (!saved) {
			await this._trySaveToFallback(removed);
		}
	}

	private _spliceExcess(): { excess: number; removed: MemoryWalEntry[] } {
		const excess = this._buffer.length - ENV.MEMORY_WAL_BUFFER_SIZE + 1;
		const removed = this._buffer.splice(0, excess);
		return { excess, removed };
	}

	private async _trySaveToRedis(removed: MemoryWalEntry[]): Promise<boolean> {
		try {
			const redis = await getStreamClient();
			const multi = redis.multi();
			for (const entry of removed) {
				multi.rpush(
					`${this._prefix}wal_buffer`,
					JSON.stringify({ topic: entry.topic, serialized: entry.serialized })
				);
			}
			await multi.exec();
			return true;
		} catch {
			return false;
		}
	}

	private async _trySaveToFallback(removed: MemoryWalEntry[]): Promise<void> {
		const lines = removed.map((entry) => JSON.stringify(entry)).join("\n");
		const fileWritten = await retryFileAppend(
			ENV.DLQ_LOCAL_FALLBACK_PATH,
			lines
		);
		if (!fileWritten) {
			logger.error(
				"Memory WAL buffer eviction: all persistence layers exhausted — messages lost",
				{ evictedCount: removed.length, buffer: "memory-wal" }
			);
		}
	}

	async recoverFromFallbackFile(): Promise<number> {
		try {
			const fs = await import("node:fs/promises");
			const content = await this._readFallbackFile(fs);
			if (!content) {
				return 0;
			}
			return await this._processRecoveredContent(fs, content);
		} catch {
			return 0;
		}
	}

	private async _processRecoveredContent(
		fs: typeof import("node:fs/promises"),
		content: string
	): Promise<number> {
		const { walEntries, remaining } = this._parseFallbackLines(content);
		this._replayWalEntries(walEntries);
		await this._writeRemainingLines(fs, remaining);
		return walEntries.length;
	}

	private _replayWalEntries(walEntries: MemoryWalEntry[]): void {
		if (walEntries.length === 0) {
			return;
		}
		this._buffer.push(...walEntries);
		logger.info(`Recovered ${walEntries.length} WAL entries from fallback file`);
	}

	private async _readFallbackFile(
		fs: typeof import("node:fs/promises")
	): Promise<string | null> {
		try {
			return await fs.readFile(ENV.DLQ_LOCAL_FALLBACK_PATH, "utf-8");
		} catch {
			return null;
		}
	}

	private _parseFallbackLines(content: string): {
		walEntries: MemoryWalEntry[];
		remaining: string[];
	} {
		const lines = content.split("\n").filter(Boolean);
		const walEntries: MemoryWalEntry[] = [];
		const remaining: string[] = [];
		for (const line of lines) {
			this._classifyLine(line, walEntries, remaining);
		}
		return { walEntries, remaining };
	}

	private _classifyLine(
		line: string,
		walEntries: MemoryWalEntry[],
		remaining: string[]
	): void {
		try {
			const parsed = JSON.parse(line);
			if (this._isValidWalEntry(parsed)) {
				walEntries.push(parsed as MemoryWalEntry);
			} else {
				remaining.push(line);
			}
		} catch {
			remaining.push(line);
		}
	}

	private _isValidWalEntry(parsed: Record<string, unknown>): boolean {
		return !!(parsed?.topic && parsed.message && parsed.deliveryAttempt === undefined);
	}

	private async _writeRemainingLines(
		fs: typeof import("node:fs/promises"),
		remaining: string[]
	): Promise<void> {
		if (remaining.length > 0) {
			await fs.writeFile(
				ENV.DLQ_LOCAL_FALLBACK_PATH,
				`${remaining.join("\n")}\n`,
				"utf-8"
			);
		} else {
			await fs.writeFile(ENV.DLQ_LOCAL_FALLBACK_PATH, "", "utf-8");
		}
	}
}
