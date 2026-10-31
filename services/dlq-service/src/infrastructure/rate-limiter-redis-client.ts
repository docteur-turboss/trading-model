import type { RedisConnectionConfig } from "@trading-model/persistence/redis-config";
import { createRedisClient } from "@trading-model/persistence/redis-connection-manager";
import { redisConnectionFromEnv } from "@trading-model/persistence/redis-env";
import type { Redis } from "ioredis";
import { logger } from "../config/logger";
import { ENV } from "./config/env";

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

		const connection = redisConnectionFromEnv(ENV);
		if (!connection) {
			return null;
		}
		return this._create(connection);
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

	private _create(connection: RedisConnectionConfig): Redis | null {
		try {
			this._client = createRedisClient(connection) as Redis;
			this._client.connect().catch((err) => {
				logger.warn("Rate limiter Redis connection failed", {
					error: (err as Error)?.message,
				});
				this._client = null;
				this._initializing = false;
			});
			return this._client;
		} catch (err) {
			logger.warn("Rate limiter Redis client creation failed", {
				error: (err as Error)?.message,
			});
			return null;
		}
	}
}

export const redisClientManager = new RedisClientManager();
