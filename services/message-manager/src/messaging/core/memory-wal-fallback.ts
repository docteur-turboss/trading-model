import { FileWalFallback } from "./file-wal-fallback";
import type { MemoryWalEntry } from "./memory-wal-entry";
import { RedisWalFallback } from "./redis-wal-fallback";

export class MemoryWalFallback {
	private readonly _redis: RedisWalFallback;
	private readonly _file: FileWalFallback;

	constructor(prefix: string) {
		this._redis = new RedisWalFallback(prefix);
		this._file = new FileWalFallback();
	}

	async trySaveToRedis(removed: MemoryWalEntry[]): Promise<boolean> {
		return this._redis.trySave(removed);
	}

	async trySaveToFallback(removed: MemoryWalEntry[]): Promise<void> {
		return this._file.trySave(removed);
	}

	async recoverFromFallbackFile(): Promise<MemoryWalEntry[]> {
		return this._file.recover();
	}
}
