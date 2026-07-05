import type { Message } from "@trading-model/common/contracts/message.types";
import { safeStringify } from "@trading-model/common/utils/safe-stringify";

import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { MemoryWalBuffer } from "./memory-wal-buffer";

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

	constructor(
		private readonly _prefix: string,
		private readonly _memoryWalBuffer: MemoryWalBuffer
	) {}

	private _walKey(): string {
		return `${this._prefix}wal_buffer`;
	}

	private _streamKey(topic: string): string {
		return `${this._prefix}stream:${topic}`;
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

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
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
		try {
			await this._memoryWalBuffer.recoverFromFallbackFile();
		} catch {
			// best-effort
		}
		try {
			const redis = await getStreamClient();
			const len = await redis.llen(this._walKey());
			if (len > 0) {
				logger.info(
					`WAL buffer has ${len} pending entries from previous run — draining`
				);
				await this._flushWal();
			}
		} catch {
			// Redis not available — WAL will be drained when Redis is back
		}
	}

	async drainAndStop(timeoutMs = 10_000): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		try {
			const remaining = deadline - Date.now();
			if (remaining > 0) {
				await this.drain(remaining);
			}
		} catch (err) {
			logger.warn("WAL drain failed during shutdown", {
				error: (err as Error).message,
			});
		}
		while (this._memoryWalBuffer.length > 0) {
			if (Date.now() >= deadline) {
				logger.warn("Memory WAL drain timed out", {
					remaining: this._memoryWalBuffer.length,
				});
				break;
			}
			try {
				await this._memoryWalBuffer.drainAll();
			} catch {
				break;
			}
		}
		this.stop();
	}

	async drain(timeoutMs = 10_000): Promise<void> {
		if (this._walDrainRequested) {
			return;
		}
		this._walDrainRequested = true;
		const gen = ++this._walDrainGen;

		try {
			await this._memoryWalBuffer.drainAll();
			const redis = await getStreamClient();
			const remaining = await redis.llen(this._walKey());
			if (remaining === 0 && this._memoryWalBuffer.length === 0) {
				return;
			}

			await this._flushWal();

			return new Promise<void>((resolve) => {
				const timer = setTimeout(() => {
					if (this._walDrainGen === gen) {
						this._walDrainResolve = null;
						logger.warn(`WAL drain timed out after ${timeoutMs}ms`);
						resolve();
					}
				}, timeoutMs);
				this._walDrainResolve = () => {
					if (this._walDrainGen === gen) {
						clearTimeout(timer);
						this._walDrainResolve = null;
						resolve();
					}
				};
			});
		} finally {
			this._walDrainRequested = false;
		}
	}

	async flush(): Promise<void> {
		await this._flushWal();
	}

	bufferInMemory(topic: string, serialized: string, message: Message): void {
		this._memoryWalBuffer.push(topic, serialized, message);
	}

	private _drainWalEntry(
		entry: string
	): { topic: string; data: string } | null {
		try {
			const parsed = JSON.parse(entry) as {
				topic: string;
				serialized?: string;
				message?: Message;
			};
			return {
				topic: parsed.topic,
				data: parsed.serialized ?? safeStringify(parsed.message!),
			};
		} catch {
			logger.warn("WAL flush: malformed entry dropped", {
				entry: entry.substring(0, 200),
			});
			return null;
		}
	}

	private async _flushWalBatch(raw: string[]): Promise<boolean> {
		const redis = await getStreamClient();
		const multi = redis.multi();
		for (const entry of raw) {
			const parsed = this._drainWalEntry(entry);
			if (!parsed) {
				continue;
			}
			const key = this._streamKey(parsed.topic);
			multi.xadd(
				key,
				"MAXLEN",
				"~",
				ENV.REDIS_STREAM_MAXLEN,
				"*",
				"data",
				parsed.data
			);
			multi.expire(key, ENV.REDIS_MESSAGE_TTL_S);
		}

		try {
			const results = await multi.exec();
			if (results) {
				const anyFailed = results.some((resultItem) => resultItem[0] !== null);
				if (anyFailed) {
					return false;
				}
			}
			return true;
		} catch {
			return false;
		}
	}

	private _bufferWalEntries(raw: string[]): void {
		for (const entry of raw) {
			try {
				const parsed = JSON.parse(entry) as {
					topic: string;
					serialized?: string;
					message?: Message;
				};
				const topic = parsed.topic;
				const serialized = parsed.serialized ?? safeStringify(parsed.message!);
				const message = parsed.message ?? JSON.parse(parsed.serialized!);
				this._memoryWalBuffer.push(topic, serialized, message);
			} catch {}
		}
	}

	private async _handleWalFlushError(
		raw: string[],
		consecutiveErrors: number
	): Promise<"retry" | "memory-buffer" | "abort"> {
		if (consecutiveErrors >= 5) {
			logger.error(
				"WAL flush: too many consecutive errors — switching to memory buffer"
			);
			this._bufferWalEntries(raw);
			return "memory-buffer";
		}

		if (raw.length > 0) {
			try {
				const redis = await getStreamClient();
				const restore = redis.multi();
				for (const entry of raw) {
					restore.rpush(this._walKey(), entry);
				}
				await restore.exec();
			} catch {
				this._bufferWalEntries(raw);
			}
		}

		return "retry";
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
			return new Promise<void>((resolve) => {
				this._walFlushWaiters.push(resolve);
			});
		}
		this._walFlushing = true;

		try {
			await this._drainWalLoop();
		} catch (err) {
			logger.error("WAL flush error", { error: (err as Error).message });
		} finally {
			this._completeWalFlush();
		}
	}

	private async _drainWalLoop(): Promise<void> {
		const redis = await getStreamClient();
		let consecutiveErrors = 0;
		while (true) {
			const raw = (await redis.eval(
				ATOMIC_WAL_READ_LUA,
				1,
				this._walKey(),
				WAL_BATCH_SIZE.toString()
			)) as string[];
			if (raw.length === 0) {
				break;
			}

			const ok = await this._flushWalBatch(raw);
			if (ok) {
				consecutiveErrors = 0;
				continue;
			}

			consecutiveErrors++;
			logger.warn(
				"WAL flush pipeline: some commands failed — retrying batch",
				{
					consecutiveErrors,
					batchSize: raw.length,
				}
			);
			const action = await this._handleWalFlushError(raw, consecutiveErrors);
			const backoff = Math.min(1000 * 2 ** consecutiveErrors, 30000);
			await this._sleepWithJitter(backoff);
			if (action === "abort") {
				break;
			}
			break;
		}
	}
}
