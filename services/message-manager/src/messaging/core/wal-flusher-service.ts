import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import { MemoryWalBuffer } from "./memory-wal-buffer";
import { WalBatchFlusher } from "./wal-batch-flusher";
import { WalDrainCoordinator } from "./wal-drain-coordinator";
import { WalEntryParser } from "./wal-entry-parser";
import { WalFlushErrorHandler } from "./wal-flush-error-handler";
import { WalFlushLoop } from "./wal-flush-loop";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

const WAL_LIST_MAX_LEN = 1_000_000;

export class WalFlusherService {
	private _walFlushing = false;
	private readonly _walFlusherTimer = new TimerHandle();

	private readonly _flushLoop: WalFlushLoop;
	private readonly _drainCoordinator: WalDrainCoordinator;

	constructor(
		private readonly _prefix: string,
		private readonly _memoryWalBuffer: MemoryWalBuffer
	) {
		const batchFlusher = new WalBatchFlusher(
			this._prefix,
			ENV.REDIS_STREAM_MAXLEN,
			ENV.REDIS_MESSAGE_TTL_S
		);
		const entryParser = new WalEntryParser(this._memoryWalBuffer);
		const errorHandler = new WalFlushErrorHandler(entryParser);
		this._flushLoop = new WalFlushLoop(
			batchFlusher,
			errorHandler,
			() => this._walKey(),
		);
		this._drainCoordinator = new WalDrainCoordinator(
			this._memoryWalBuffer,
			() => this._walKey(),
			() => this._flushWal(),
		);
	}

	private _walKey(): string {
		return `${this._prefix}wal_buffer`;
	}

	start(): void {
		this._walFlusherTimer.startInterval(() => {
			this._flushWal().catch(() => {});
		}, 1000);
		this._walFlusherTimer.unref();
	}

	stop(): void {
		this._walFlusherTimer.stop();
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
		await this._drainCoordinator.drainOnStartup();
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
				await this._drainCoordinator.drain(remaining);
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
		return this._drainCoordinator.drain(timeoutMs);
	}

	async flush(): Promise<void> {
		await this._flushWal();
	}

	bufferInMemory(topic: string, serialized: string, message: Message): void {
		this._memoryWalBuffer.push(topic, serialized, message);
	}

	private _completeWalFlush(): void {
		this._walFlushing = false;
		this._drainCoordinator.resolveDrain();
		this._drainCoordinator.notifyWaiters();
	}

	private async _flushWal(): Promise<void> {
		if (this._walFlushing) {
			return this._drainCoordinator.enqueueFlushWaiter();
		}
		this._walFlushing = true;

		try {
			await this._flushLoop.drainAll();
		} catch (err) {
			logger.error("WAL flush error", { context: { error: (err as Error).message } });
		} finally {
			this._completeWalFlush();
		}
	}
}
