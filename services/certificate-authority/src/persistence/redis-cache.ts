import { logger } from "@trading-model/common/config/logger";
import Redis from "ioredis";

export interface CacheOptions {
	ttlMs: number;
	prefix: string;
}

export interface RedisCache {
	disconnect(): Promise<void>;
	publish(channel: string, message: string): Promise<void>;
	subscribe(channel: string, handler: (message: string) => void): Promise<() => void>;
	isAvailable(): boolean;
	get<TData>(key: string): Promise<TData | null>;
	set(key: string, value: unknown, ttlMs: number): Promise<void>;
	del(key: string): Promise<void>;
	clear(): Promise<void>;
	makeKey(parts: string[]): string;
}

export class NullCache implements RedisCache {
	async disconnect(): Promise<void> {}

	async publish(_channel: string, _message: string): Promise<void> {}

	async subscribe(_channel: string, _handler: (message: string) => void): Promise<() => void> {
		return () => {};
	}

	isAvailable(): boolean {
		return false;
	}

	async get<TData>(_key: string): Promise<TData | null> {
		return null;
	}

	async set(_key: string, _value: unknown, _ttlMs: number): Promise<void> {}

	async del(_key: string): Promise<void> {}

	async clear(): Promise<void> {}

	makeKey(parts: string[]): string {
		return `ca-cache:${parts.join(":")}`;
	}
}

class RealRedisCache implements RedisCache {
	private readonly _client: Redis;
	private readonly _options: CacheOptions;

	private _createClient(redisUrl: string): Redis {
		const client = new Redis(redisUrl, {
			enableReadyCheck: true,
			maxRetriesPerRequest: 3,
			retryStrategy: (times) => (times > 10 ? null : Math.min(times * 1000, 30000)),
			lazyConnect: true,
		});
		client.on("error", (err) => logger.warn("Redis cache error (falling through to DB)", { context: { err } }));
		return client;
	}

	constructor(redisUrl: string, options?: Partial<CacheOptions>) {
		this._client = this._createClient(redisUrl);
		this._options = { ttlMs: options?.ttlMs ?? 300_000, prefix: options?.prefix ?? "ca-cache" };
	}

	async disconnect(): Promise<void> {
		try {
			await this._client.quit();
		} catch {
			/* closing */
		}
	}

	async publish(channel: string, message: string): Promise<void> {
		try {
			await this._client.publish(channel, message);
		} catch {
			// best-effort
		}
	}

	async subscribe(channel: string, handler: (message: string) => void): Promise<() => void> {
		const subscriber = this._duplicateSubscriber();
		let unsubscribed = false;
		const onMessage = (_ch: string, msg: string) => {
			if (!unsubscribed) {
				handler(msg);
			}
		};
		try {
			await _doSubscribe(subscriber, channel);
			subscriber.on("message", onMessage);
			subscriber.on("reconnecting", () => {
				logger.info("Redis subscriber reconnecting, will re-subscribe to channel", { context: { channel } });
			});
			subscriber.on("connect", () => {
				if (!unsubscribed) {
					_doSubscribe(subscriber, channel).catch(() => {});
				}
			});
			return _createUnsubscriber({
				subscriber,
				channel,
				onMessage,
				onClose: () => {
					unsubscribed = true;
				},
			});
		} catch {
			subscriber.quit().catch(() => {});
			return () => {};
		}
	}

	private _duplicateSubscriber(): Redis {
		return this._client.duplicate({
			retryStrategy: (times) => {
				if (times > 10) {
					return null;
				}
				return Math.min(times * 1000, 30000);
			},
		});
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

	async set(key: string, value: unknown, ttlMs: number): Promise<void> {
		try {
			await this._client.setex(key, Math.ceil(ttlMs / 1000), JSON.stringify(value));
		} catch (err) {
			logger.warn("Redis cache set failed", { context: { err } });
		}
	}

	async del(key: string): Promise<void> {
		try {
			await this._client.del(key);
		} catch {
			// ignore
		}
	}

	private async _scanAndDelete(): Promise<void> {
		let cursor = "0";
		do {
			const result = await this._client.scan(cursor, "MATCH", "ca-cache:*", "COUNT", "100");
			cursor = result[0];
			const keys = result[1];
			if (keys.length > 0) {
				await this._client.del(...keys);
			}
		} while (cursor !== "0");
	}

	async clear(): Promise<void> {
		try {
			await this._scanAndDelete();
		} catch {
			// best-effort
		}
	}

	makeKey(parts: string[]): string {
		return `ca-cache:${parts.join(":")}`;
	}
}

export function createCache(redisUrl?: string): RedisCache {
	return redisUrl ? new RealRedisCache(redisUrl) : new NullCache();
}

async function _doSubscribe(subscriber: Redis, channel: string): Promise<void> {
	try {
		await subscriber.subscribe(channel);
	} catch {
		// retry will handle
	}
}

interface UnsubscriberContext {
	subscriber: Redis;
	channel: string;
	onMessage: (_ch: string, msg: string) => void;
	onClose?: () => void;
}

function _createUnsubscriber({ subscriber, channel, onMessage, onClose }: UnsubscriberContext): () => void {
	return () => {
		onClose?.();
		subscriber.removeListener("message", onMessage);
		subscriber.unsubscribe(channel).catch(() => {});
		subscriber.quit().catch(() => {});
	};
}
