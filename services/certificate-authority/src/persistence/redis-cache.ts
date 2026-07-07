import { logger } from "@trading-model/common/config/logger";
import Redis from "ioredis";

export interface CacheOptions {
	ttlMs: number;
	prefix: string;
}

export interface CacheSetEntry {
	key: string;
	value: unknown;
	ttlMs: number;
}

export interface RedisCache {
	disconnect(): Promise<void>;
	isAvailable(): boolean;
	get<TData>(key: string): Promise<TData | null>;
	set(entry: CacheSetEntry): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
	makeKey(parts: string[]): string;
}

export class NullCache implements RedisCache {
	async disconnect(): Promise<void> {}

	isAvailable(): boolean {
		return false;
	}

	async get<TData>(_key: string): Promise<TData | null> {
		return null;
	}

	async set(_entry: CacheSetEntry): Promise<void> {}

	async delete(_key: string): Promise<void> {}

	async clear(): Promise<void> {}

	makeKey(parts: string[]): string {
		return `ca-cache:${parts.join(":")}`;
	}
}

class RealRedisCache implements RedisCache {
	private readonly _client: Redis;

	private _buildCacheRedisOptions() {
		return {
			enableReadyCheck: true,
			maxRetriesPerRequest: 3,
			retryStrategy: (times: number) => (times > 10 ? null : Math.min(times * 1000, 30000)),
			lazyConnect: true,
		};
	}

	private _createClient(redisUrl: string): Redis {
		const client = new Redis(redisUrl, this._buildCacheRedisOptions());
		client.on("error", (err) =>
			logger.warn("Redis cache error (falling through to DB)", { context: { err } })
		);
		return client;
	}

	constructor(redisUrl: string) {
		this._client = this._createClient(redisUrl);
	}

	async disconnect(): Promise<void> {
		try {
			await this._client.quit();
		} catch {
			logger.debug("Redis quit error during disconnect");
		}
	}

	isAvailable(): boolean {
		return true;
	}

	async get<TData>(key: string): Promise<TData | null> {
		try {
			const raw = await this._client.get(key);
			return raw ? (JSON.parse(raw) as TData) : null;
		} catch {
			return null;
		}
	}

	async set(entry: CacheSetEntry): Promise<void> {
		const { key, value, ttlMs } = entry;
		try {
			await this._client.setex(
				key,
				Math.ceil(ttlMs / 1000),
				JSON.stringify(value)
			);
		} catch (err) {
			logger.warn("Redis cache set failed", { context: { err } });
		}
	}

	async delete(key: string): Promise<void> {
		try {
			await this._client.del(key);
		} catch {
			logger.debug("Redis delete failed (best-effort)");
		}
	}

	private async _scanBatch(
		cursor: string
	): Promise<{ nextCursor: string; keys: string[] }> {
		const result = await this._client.scan(
			cursor,
			"MATCH",
			"ca-cache:*",
			"COUNT",
			"100"
		);
		return { nextCursor: result[0], keys: result[1] };
	}

	private async _scanAndDelete(): Promise<void> {
		let cursor = "0";
		do {
			const { nextCursor, keys } = await this._scanBatch(cursor);
			cursor = nextCursor;
			if (keys.length > 0) {
				await this._client.del(...keys);
			}
		} while (cursor !== "0");
	}

	async clear(): Promise<void> {
		try {
			await this._scanAndDelete();
		} catch {
			logger.debug("Redis clear failed (best-effort)");
		}
	}

	makeKey(parts: string[]): string {
		return `ca-cache:${parts.join(":")}`;
	}
}

export function createCache(redisUrl?: string): RedisCache {
	return redisUrl ? new RealRedisCache(redisUrl) : new NullCache();
}
