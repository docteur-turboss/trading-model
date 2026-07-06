import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";
import { getStreamClient } from "../../config/redis";
import type { MemoryWalBuffer } from "./memory-wal-buffer";
import { WalBatchFlusher } from "./wal-batch-flusher";
import { WalDrainCoordinator } from "./wal-drain-coordinator";
import { WalEntryParser } from "./wal-entry-parser";
import { WalFlushErrorHandler } from "./wal-flush-error-handler";
import { WalFlushLoop } from "./wal-flush-loop";
import { WalFlushManager } from "./wal-flush-manager";
import { WalShutdownDrainer } from "./wal-shutdown-drainer";

const WAL_LIST_MAX_LEN = 1_000_000;

export class WalFlusherService {
	private readonly _flushManager: WalFlushManager;
	private readonly _flushLoop: WalFlushLoop;
	private readonly _drainCoordinator: WalDrainCoordinator;
	private readonly _shutdownDrainer: WalShutdownDrainer;

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
		this._flushLoop = new WalFlushLoop(batchFlusher, errorHandler, () =>
			this._walKey()
		);
		this._drainCoordinator = new WalDrainCoordinator(
			this._memoryWalBuffer,
			() => this._walKey(),
			() => this._flushManager.flush()
		);
		this._flushManager = new WalFlushManager(
			this._flushLoop,
			this._drainCoordinator
		);
		this._shutdownDrainer = new WalShutdownDrainer(
			this._drainCoordinator,
			this._memoryWalBuffer
		);
	}

	private _walKey(): string {
		return `${this._prefix}wal_buffer`;
	}

	start(): void {
		this._flushManager.start();
	}

	stop(): void {
		this._flushManager.stop();
	}

	async storeInWal(topic: string, serialized: string): Promise<void> {
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
		await this._shutdownDrainer.drainWalWithDeadline(deadline);
		await this._shutdownDrainer.drainMemoryWithDeadline(deadline);
		this.stop();
	}

	async drain(timeoutMs = 10_000): Promise<void> {
		return this._drainCoordinator.drain(timeoutMs);
	}

	async flush(): Promise<void> {
		await this._flushManager.flush();
	}

	bufferInMemory(topic: string, serialized: string, message: Message): void {
		this._memoryWalBuffer.push(topic, serialized, message);
	}
}
