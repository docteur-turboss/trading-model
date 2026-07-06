import Redis from "ioredis";

export class RedisLockConnector {
	private _client!: Redis;
	private _available = true;

	constructor(redisUrl: string) {
		this._connect(redisUrl);
	}

	private _connect(redisUrl: string): void {
		try {
			this._client = new Redis(redisUrl, {
				enableReadyCheck: true,
				maxRetriesPerRequest: 1,
				retryStrategy: () => null,
				lazyConnect: true,
			});
			this._client.on("error", () => {
				this._available = false;
			});
		} catch {
			this._available = false;
		}
	}

	get client(): Redis | null {
		return this._client;
	}

	get available(): boolean {
		return this._available;
	}

	set available(value: boolean) {
		this._available = value;
	}

	disconnect(): void {
		this._client?.disconnect();
	}
}
