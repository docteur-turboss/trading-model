import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { WalBatchFlusher } from "./wal-batch-flusher";
import { WalEntryParser } from "./wal-entry-parser";
import { WalFlushErrorHandler } from "./wal-flush-error-handler";

const WAL_BATCH_SIZE = 50;
const WAL_LIST_MAX_LEN = 1_000_000;
const ATOMIC_WAL_READ_LUA = `
  local entries = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
  if #entries > 0 then
    redis.call('LTRIM', KEYS[1], #entries, -1)
  end
  return entries
`;

export class WalFlusherService {
	private _walFlushing = false;
	private _walFlusherTimer: ReturnType<typeof setInterval> | null = null;
	private _walDrainRequested = false;
	private _walDrainResolve: (() => void) | null = null;
	private _walDrainGen = 0;
	private _walFlushWaiters: Array<() => void> = [];

	private readonly _batchFlusher: WalBatchFlusher;
	private readonly _errorHandler: WalFlushErrorHandler;

	constructor(
		private readonly _prefix: string,
		private readonly _memoryWalBuffer: MemoryWalBuffer
	) {
		this._batchFlusher = new WalBatchFlusher(
			this._prefix,
			ENV.REDIS_STREAM_MAXLEN,
			ENV.REDIS_MESSAGE_TTL_S
		);
		const entryParser = new WalEntryParser(this._memoryWalBuffer);
		this._errorHandler = new WalFlushErrorHandler(entryParser);
	}

	private _walKey(): string {
		return `${this._prefix}wal_buffer`;
	}

	start(): void {
		this._walFlusherTimer = setInterval(() => {
			this._flushWal().catch(() => {});
		}, 1000);
		this._walFlusherTimer.unref();
	}

	stop(): void {
		if (this._walFlusherTimer) {
			clearInterval(this._walFlusherTimer);
			this._walFlusherTimer = null;
		}
	}

	async storeInWal(
		topic: string,
		serialized: string
	): Promise<void> {
		const redis = await getStreamClient();
		const walEntry = JSON.stringify({ topic, serialized });
		await redis.rpush(this._walKey(), walEntry);
		await redis.ltrim(this._walKey(), -WAL_LIST_MAX_LEN, -1);
		await redis.expire(this._walKey(), 7200);
	}

	async drainOnStartup(): Promise<void> {
		await this._recoverFallback();
		await this._drainExistingWal();
	}

	private async _recoverFallback(): Promise<void> {
		try {
			await this._memoryWalBuffer.recoverFromFallbackFile();
		} catch {
			// best-effort
		}
	}

	private async _drainExistingWal(): Promise<void> {
		try {
			const redis = await getStreamClient();
			const len = await redis.llen(this._walKey());
			if (len > 0) {
				logger.info(`WAL buffer has ${len} pending entries from previous run — draining`);
				await this._flushWal();
			}
		} catch {
			// Redis not available
		}
	}

	async drainAndStop(timeoutMs = 10_000): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		await this._drainWalWithDeadline(deadline);
		await this._drainMemoryWithDeadline(deadline);
		this.stop();
	}

	private async _drainWalWithDeadline(deadline: number): Promise<void> {
		try {
			const remaining = deadline - Date.now();
			if (remaining > 0) {
				await this.drain(remaining);
			}
		} catch (err) {
			logger.warn("WAL drain failed during shutdown", { context: {
				error: (err as Error).message,
			} });
		}
	}

	private async _drainMemoryWithDeadline(deadline: number): Promise<void> {
		while (this._memoryWalBuffer.length > 0) {
			if (Date.now() >= deadline) {
				logger.warn("Memory WAL drain timed out", { context: {
				remaining: this._memoryWalBuffer.length,
			} });
				break;
			}
			try {
				await this._memoryWalBuffer.drainAll();
			} catch {
				break;
			}
		}
	}

	async drain(timeoutMs = 10_000): Promise<void> {
		if (this._walDrainRequested) {
			return;
		}
		this._walDrainRequested = true;
		const gen = ++this._walDrainGen;

		try {
			const done = await this._tryDrainAll();
			if (done) {
				return;
			}
			await this._flushWal();
			return this._waitForDrainCompletion(gen, timeoutMs);
		} finally {
			this._walDrainRequested = false;
		}
	}

	private async _tryDrainAll(): Promise<boolean> {
		await this._memoryWalBuffer.drainAll();
		const redis = await getStreamClient();
		const remaining = await redis.llen(this._walKey());
		return remaining === 0 && this._memoryWalBuffer.length === 0;
	}

	async flush(): Promise<void> {
		await this._flushWal();
	}

	bufferInMemory(topic: string, serialized: string, message: Message): void {
		this._memoryWalBuffer.push(topic, serialized, message);
	}

	private _completeWalFlush(): void {
		this._walFlushing = false;
		if (this._walDrainResolve) {
			const resolve = this._walDrainResolve;
			this._walDrainResolve = null;
			resolve();
		}
		const waiters = this._walFlushWaiters.splice(0);
		for (const waiter of waiters) {
			try {
				waiter();
			} catch {
				/* best-effort */
			}
		}
	}

	private async _flushWal(): Promise<void> {
		if (this._walFlushing) {
			return this._enqueueFlushWaiter();
		}
		this._walFlushing = true;

		try {
			await this._drainWalLoop();
		} catch (err) {
			logger.error("WAL flush error", { context: { error: (err as Error).message } });
		} finally {
			this._completeWalFlush();
		}
	}

	private _enqueueFlushWaiter(): Promise<void> {
		return new Promise<void>((resolve) => {
			this._walFlushWaiters.push(resolve);
		});
	}

	private async _drainWalLoop(): Promise<void> {
		const redis = await getStreamClient();
		let consecutiveErrors = 0;
		while (true) {
			const raw = await this._readWalEntries(redis);
			if (raw.length === 0) {
				break;
			}

			if (await this._batchFlusher.flushBatch(raw)) {
				consecutiveErrors = 0;
				continue;
			}

			if (!(await this._handleBatchError(raw, consecutiveErrors))) {
				break;
			}
			consecutiveErrors++;
			break;
		}
	}

	private async _readWalEntries(redis: import("ioredis").Redis): Promise<string[]> {
		return (await redis.eval(ATOMIC_WAL_READ_LUA, 1, this._walKey(), WAL_BATCH_SIZE.toString())) as string[];
	}

	private async _handleBatchError(
		raw: string[],
		consecutiveErrors: number
	): Promise<boolean> {
		const nextErrors = consecutiveErrors + 1;
		logger.warn("WAL flush pipeline: some commands failed — retrying batch", {
			consecutiveErrors: nextErrors,
			batchSize: raw.length,
		});
		const action = await this._errorHandler.handle(raw, nextErrors, this._walKey(), this._prefix, this._memoryWalBuffer);
		const backoff = Math.min(1000 * 2 ** nextErrors, 30000);
		await this._sleepWithJitter(backoff);
		return action !== "abort";
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
	}
}
