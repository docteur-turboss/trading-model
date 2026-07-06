import type { MemoryWalEntry } from "./memory-wal-entry";
import type { RedisBackoff } from "./redis-backoff";

export class FlushGuard {
	private _flushing = false;

	get isFlushing(): boolean {
		return this._flushing;
	}

	setFlushing(value: boolean): void {
		this._flushing = value;
	}

	shouldSkip(buffer: MemoryWalEntry[], redisBackoff: RedisBackoff): boolean {
		if (this._flushing) {
			return true;
		}
		if (redisBackoff.isInRetryWindow()) {
			return true;
		}
		if (buffer.length === 0) {
			redisBackoff.resetBackoff();
			return true;
		}
		return false;
	}
}
