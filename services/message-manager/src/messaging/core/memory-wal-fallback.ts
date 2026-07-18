import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { FileWalFallback } from "./file-wal-fallback";
import type { MemoryWalEntry } from "./memory-wal-entry";
import { RedisWalFallback } from "./redis-wal-fallback";
import type { WalFallback } from "./wal-fallback.interface";

export class MemoryWalFallback implements WalFallback {
	private readonly _redis: RedisWalFallback;
	private readonly _file: FileWalFallback;

	constructor(keys: RedisKeyBuilder) {
		this._redis = new RedisWalFallback(keys);
		this._file = new FileWalFallback();
	}

	async trySave(removed: MemoryWalEntry[]): Promise<boolean> {
		const saved = await this._redis.trySave(removed);
		if (!saved) {
			await this._file.trySave(removed);
		}
		return saved;
	}

	recover(): Promise<MemoryWalEntry[]> {
		return this._file.recover();
	}
}
