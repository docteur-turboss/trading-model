import Redis from "ioredis";

export class RedisLockConnector {
	private _client!: Redis;
	private _available = true;

	constructor(redisUrl: string) {
		this._connect(redisUrl);
	}

	private _buildRedisOptions() {
		return {
			enableReadyCheck: true,
			maxRetriesPerRequest: 1,
			retryStrategy: () => null,
			lazyConnect: true,
		};
	}

	private _connect(redisUrl: string): void {
		try {
			this._client = new Redis(redisUrl, this._buildRedisOptions());
			this._client.on("error", () => {
				this._available = false;
			});
		} catch {
			this._available = false;
		}
	}

	get client(): Redis {
		return this._client;
	}

	get available(): boolean {
		return this._available;
	}

	set available(value: boolean) {
		this._available = value;
	}

	disconnect(): void {
		this._client.disconnect();
	}
}
