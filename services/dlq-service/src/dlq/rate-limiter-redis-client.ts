import { createRedisClient } from "@trading-model/common/persistence/redis-connection-manager";
import type { Redis } from "ioredis";
import { ENV } from "../config/env";

export class RedisClientManager {
	private _client: Redis | null = null;
	private _initializing = false;

	getOrCreate(): Redis | null {
		if (this._client) {
			return this._client;
		}
		if (this._initializing) {
			return null;
		}
		this._initializing = true;

		if (!ENV.REDIS_URL) {
			return null;
		}
		return this._create();
	}

	async close(): Promise<void> {
		if (this._client) {
			try {
				await this._client.quit();
			} catch {
				this._client.disconnect();
			}
			this._client = null;
		}
		this._initializing = false;
	}

	private _create(): Redis | null {
		try {
			this._client = this._newClient();
			this._client.connect().catch(() => {
				this._client = null;
				this._initializing = false;
			});
			return this._client;
		} catch {
			return null;
		}
	}

	private _newClient(): Redis {
		return createRedisClient(ENV.REDIS_URL!) as Redis;
	}
}

export const redisClientManager = new RedisClientManager();
