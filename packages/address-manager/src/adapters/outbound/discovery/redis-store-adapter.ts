import type { IStoreAdapter } from "@trading-model/common/persistence/store-adapter.interface";

interface RedisLike {
	get(key: string): Promise<string | null>;
	setex(key: string, seconds: number, value: string): Promise<unknown>;
	del(...keys: string[]): Promise<number>;
}

export class RedisStoreAdapter<TValue> implements IStoreAdapter<TValue> {
	private readonly _redis: RedisLike;
	private readonly _prefix: string;
	private readonly _ttlSec: number;

	constructor(redis: RedisLike, prefix: string, ttlSec: number) {
		this._redis = redis;
		this._prefix = prefix;
		this._ttlSec = ttlSec;
	}

	async get(key: string): Promise<TValue | null> {
		const raw = await this._redis.get(`${this._prefix}${key}`);
		if (!raw) {
			return null;
		}
		return JSON.parse(raw) as TValue;
	}

	async set(key: string, value: TValue, ttlMs?: number): Promise<void> {
		const ttlSec = ttlMs === undefined ? this._ttlSec : Math.ceil(ttlMs / 1000);
		await this._redis.setex(
			`${this._prefix}${key}`,
			ttlSec,
			JSON.stringify(value)
		);
	}

	async delete(key: string): Promise<void> {
		await this._redis.del(`${this._prefix}${key}`);
	}
}
