import type { URLString } from "@trading-model/common/domain/primitives";
import Redis from "ioredis";

export class RedisLockConnector {
	private _client: Redis | undefined;
	private _available = true;

	constructor(redisUrl: URLString) {
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

	private _connect(redisUrl: URLString): void {
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
		if (!this._client) {
			throw new Error("Redis client not initialized");
		}
		return this._client;
	}

	get available(): boolean {
		return this._available;
	}

	setAvailable(value: boolean): void {
		this._available = value;
	}

	disconnect(): void {
		this._client?.disconnect();
	}
}
