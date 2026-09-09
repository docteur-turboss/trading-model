import type { Topic } from "@trading-model/common/domain/primitives";
import { getStreamClient } from "../../config/redis";
import { ENV } from "../../infrastructure/config/env";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import type { MemoryWalBuffer } from "./memory-wal-buffer";
import type { MemoryWalEntry } from "./memory-wal-entry";
import { WalBatchFlusher } from "./wal-batch-flusher";
import { WalDrainCoordinator } from "./wal-drain-coordinator";
import { WalEntryParser } from "./wal-entry-parser";
import { WalFlushErrorHandler } from "./wal-flush-error-handler";
import { WalFlushLoop } from "./wal-flush-loop";
import { WalFlushManager } from "./wal-flush-manager";
import { WalShutdownDrainer } from "./wal-shutdown-drainer";

const WAL_LIST_MAX_LEN = 1_000_000;

export class WalStorage {
	private readonly _keys: RedisKeyBuilder;

	constructor(keys: RedisKeyBuilder) {
		this._keys = keys;
	}

	walKey(): string {
		return this._keys.key("wal_buffer");
	}

	async storeInWal(topic: Topic, serialized: string): Promise<void> {
		const redis = await getStreamClient();
		const walEntry = JSON.stringify({ topic, serialized });
		const key = this.walKey();
		await redis.rpush(key, walEntry);
		await redis.ltrim(key, -WAL_LIST_MAX_LEN, -1);
		await redis.expire(key, 7200);
	}
}

export class WalFlusherService {
	private readonly _flushManager: WalFlushManager;
	private readonly _flushLoop: WalFlushLoop;
	private readonly _drainCoordinator: WalDrainCoordinator;
	private readonly _shutdownDrainer: WalShutdownDrainer;
	private readonly _walStorage: WalStorage;

	constructor(
		private readonly _keys: RedisKeyBuilder,
		private readonly _memoryWalBuffer: MemoryWalBuffer
	) {
		this._walStorage = new WalStorage(this._keys);
		const batchFlusher = new WalBatchFlusher(
			this._keys,
			ENV.REDIS_STREAM_MAXLEN,
			ENV.REDIS_MESSAGE_TTL_S
		);
		const entryParser = new WalEntryParser(this._memoryWalBuffer);
		const errorHandler = new WalFlushErrorHandler(entryParser);
		this._flushLoop = new WalFlushLoop(batchFlusher, errorHandler, () =>
			this._walStorage.walKey()
		);
		this._drainCoordinator = new WalDrainCoordinator(
			this._memoryWalBuffer,
			() => this._walStorage.walKey(),
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

	get flushManager(): WalFlushManager {
		return this._flushManager;
	}

	get drainCoordinator(): WalDrainCoordinator {
		return this._drainCoordinator;
	}

	get shutdownDrainer(): WalShutdownDrainer {
		return this._shutdownDrainer;
	}

	get walStorage(): WalStorage {
		return this._walStorage;
	}

	start(): void {
		this._flushManager.start();
	}

	stop(): void {
		this._flushManager.stop();
	}

	async storeInWal(topic: Topic, serialized: string): Promise<void> {
		await this._walStorage.storeInWal(topic, serialized);
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

	drain(timeoutMs = 10_000): Promise<void> {
		return this._drainCoordinator.drain(timeoutMs);
	}

	async flush(): Promise<void> {
		await this._flushManager.flush();
	}

	bufferInMemory(entry: MemoryWalEntry): void {
		void this._memoryWalBuffer.push(entry);
	}
}
