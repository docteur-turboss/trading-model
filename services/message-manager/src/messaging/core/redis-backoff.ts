const WAL_FLUSH_RETRY_BASE_MS = 100;
const WAL_FLUSH_RETRY_MAX_MS = 10_000;
const MEMORY_WAL_REDIS_RETRY_AFTER_MS = 5_000;

export class RedisBackoff {
	private _backoff = WAL_FLUSH_RETRY_BASE_MS;
	private _redisDownSince = 0;

	get current(): number {
		return this._backoff;
	}

	get isDown(): boolean {
		return this._redisDownSince > 0;
	}

	markDown(): void {
		this._redisDownSince = Date.now();
	}

	markUp(): void {
		this._redisDownSince = 0;
	}

	resetBackoff(): void {
		this._backoff = WAL_FLUSH_RETRY_BASE_MS;
	}

	increaseBackoff(): void {
		this._backoff = Math.min(this._backoff * 2, WAL_FLUSH_RETRY_MAX_MS);
	}

	isInRetryWindow(): boolean {
		return (
			this._redisDownSince > 0 &&
			Date.now() - this._redisDownSince < MEMORY_WAL_REDIS_RETRY_AFTER_MS
		);
	}
}
