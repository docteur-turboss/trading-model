import { logger } from "@trading-model/common/config/logger";
import Redis from "ioredis";

export interface CacheOptions {
	ttlMs: number;
	prefix: string;
}

export class RedisCache {
	private readonly _client: Redis | null;

	constructor(redisUrl?: string) {
		if (!redisUrl) {
			this._client = null;
			return;
		}
		this._client = new Redis(redisUrl, {
			enableReadyCheck: true,
			maxRetriesPerRequest: 3,
			retryStrategy: (times) => {
				if (times > 10) {
					return null;
				}
				return Math.min(times * 1000, 30000);
			},
			lazyConnect: true,
		});
		this._client.on("error", (err) =>
			logger.warn("Redis cache error (falling through to DB)", {
				context: { err },
			})
		);
	}

	async disconnect(): Promise<void> {
		if (this._client) {
			try {
				await this._client.quit();
			} catch {
				/* closing */
			}
		}
	}

	/**
	 * Publishes a message to a Redis channel.
	 * Used for cross-instance event propagation (e.g., revocation notifications).
	 */
	async publish(channel: string, message: string): Promise<void> {
		if (!this._client) {
			return;
		}
		try {
			await this._client.publish(channel, message);
		} catch {
			// best-effort
		}
	}

	async subscribe(
		channel: string,
		handler: (message: string) => void
	): Promise<() => void> {
		if (!this._client) {
			return () => {};
		}
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
				logger.info(
					"Redis subscriber reconnecting, will re-subscribe to channel",
					{ context: { channel } }
				);
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
		return this._client!.duplicate({
			retryStrategy: (times) => {
				if (times > 10) {
					return null;
				}
				return Math.min(times * 1000, 30000);
			},
		});
	}

	isAvailable(): boolean {
		return this._client !== null;
	}

	async get<TData>(key: string): Promise<TData | null> {
		if (!this._client) {
			return null;
		}
		try {
			const raw = await this._client.get(key);
			return raw ? (JSON.parse(raw) as TData) : null;
		} catch {
			return null;
		}
	}

	async set(key: string, value: unknown, ttlMs: number): Promise<void> {
		if (!this._client) {
			return;
		}
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

	async del(key: string): Promise<void> {
		if (!this._client) {
			return;
		}
		try {
			await this._client.del(key);
		} catch {
			// ignore
		}
	}

	async clear(): Promise<void> {
		if (!this._client) {
			return;
		}
		try {
			let cursor = "0";
			do {
				const result = await this._client.scan(
					cursor,
					"MATCH",
					"ca-cache:*",
					"COUNT",
					"100"
				);
				cursor = result[0];
				const keys = result[1];
				if (keys.length > 0) {
					await this._client.del(...keys);
				}
			} while (cursor !== "0");
		} catch {
			// best-effort
		}
	}

	makeKey(parts: string[]): string {
		return `ca-cache:${parts.join(":")}`;
	}
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

function _createUnsubscriber({
	subscriber,
	channel,
	onMessage,
	onClose,
}: UnsubscriberContext): () => void {
	return () => {
		onClose?.();
		subscriber.removeListener("message", onMessage);
		subscriber.unsubscribe(channel).catch(() => {});
		subscriber.quit().catch(() => {});
	};
}
