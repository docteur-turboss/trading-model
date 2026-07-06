import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";

import type { Message } from "@trading-model/common/contracts/message.types";

import type { MemoryWalBuffer } from "./memory-wal-buffer";
import { WalEntryParser } from "./wal-entry-parser";

const WAL_BATCH_SIZE = 50;
const ATOMIC_WAL_READ_LUA = `
  local entries = redis.call('LRANGE', KEYS[1], 0, ARGV[1] - 1)
  if #entries > 0 then
    redis.call('LTRIM', KEYS[1], #entries, -1)
  end
  return entries
`;

export class WalListFlusher {
	private _walFlushing = false;
	private _walFlusherTimer: ReturnType<typeof setInterval> | null = null;
	private _walDrainRequested = false;
	private _walDrainResolve: (() => void) | null = null;
	private _walDrainGen = 0;
	private _walFlushWaiters: Array<() => void> = [];

	constructor(
		private readonly _prefix: string,
		private readonly _memoryWalBuffer: MemoryWalBuffer,
		private readonly _streamMaxlen: number,
		private readonly _messageTtlS: number
	) {}

	private _walKey(): string {
		return `${this._prefix}wal_buffer`;
	}

	startFlusher(): void {
		this._walFlusherTimer = setInterval(() => {
			this._flushWal().catch(() => {});
		}, 1000);
		this._walFlusherTimer.unref();
	}

	stopFlusher(): void {
		if (this._walFlusherTimer) {
			clearInterval(this._walFlusherTimer);
			this._walFlusherTimer = null;
		}
	}

	async drainOnStartup(): Promise<void> {
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

	async drainAndStop(timeoutMs = 10_000): Promise<void> {
		const deadline = Date.now() + timeoutMs;
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
		this.stopFlusher();
	}

	private _sleepWithJitter(ms: number): Promise<void> {
		const jitter = ms * 0.2 * (Math.random() * 2 - 1);
		return new Promise((resolve) =>
			setTimeout(resolve, Math.max(1, Math.round(ms + jitter)))
		);
	}

	private async _flushWalBatch(raw: string[]): Promise<boolean> {
		const redis = await getStreamClient();
		const multi = redis.multi();
		for (const entry of raw) {
			const parsed = WalEntryParser.parse(entry);
			if (!parsed) {
				continue;
			}
			const key = `${this._prefix}stream:${parsed.topic}`;
			multi.xadd(
				key,
				"MAXLEN",
				"~",
				this._streamMaxlen,
				"*",
				"data",
				parsed.data
			);
			multi.expire(key, this._messageTtlS);
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

	private async _handleWalFlushError(
		raw: string[],
		consecutiveErrors: number
	): Promise<"retry" | "memory-buffer" | "abort"> {
		if (consecutiveErrors >= 5) {
			logger.error(
				"WAL flush: too many consecutive errors — switching to memory buffer"
			);
			for (const entry of raw) {
				const parsed = WalEntryParser.parseWithMessage(entry);
				if (parsed) {
					this._memoryWalBuffer.push(parsed.topic, parsed.serialized, parsed.message as Message);
				}
			}
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
				for (const entry of raw) {
					const parsed = WalEntryParser.parseWithMessage(entry);
					if (parsed) {
						this._memoryWalBuffer.push(parsed.topic, parsed.serialized, parsed.message as Message);
					}
				}
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
				// best-effort
			}
		}
	}

	private async _readWalEntriesAtomically(): Promise<string[]> {
		const redis = await getStreamClient();
		return (await redis.eval(
			ATOMIC_WAL_READ_LUA,
			1,
			this._walKey(),
			WAL_BATCH_SIZE.toString()
		)) as string[];
	}

	private async _flushWal(): Promise<void> {
		if (this._walFlushing) {
			return new Promise<void>((resolve) => {
				this._walFlushWaiters.push(resolve);
			});
		}
		this._walFlushing = true;

		try {
			let consecutiveErrors = 0;
			while (true) {
				const raw = await this._readWalEntriesAtomically();
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
		} catch (err) {
			logger.error("WAL flush error", { context: { error: (err as Error).message } });
		} finally {
			this._completeWalFlush();
		}
	}
}
