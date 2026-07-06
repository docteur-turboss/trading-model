import { logger } from "../config/logger";

/**
 * Minimal Redis client interface for CRL cache cross-instance propagation.
 */
export interface CrlRedisClient {
	sadd(key: string, value: string): Promise<number>;
	sismember(key: string, value: string): Promise<number>;
	smembers(key: string): Promise<string[]>;
	publish(channel: string, message: string): Promise<number>;
	subscribe(
		channel: string,
		callback: (channel: string, message: string) => void
	): Promise<void>;
	unsubscribe(channel: string): Promise<void>;
	del(key: string): Promise<number>;
}

const CRL_REDIS_SET_KEY = "crl:revoked";
const CRL_REDIS_CHANNEL = "crl:updates";

/**
 * In-memory CRL cache that stores revoked certificate serial numbers.
 * Updated via the message-bus CrlSubscriber or by polling the CA.
 *
 * When a Redis client is provided, revocation events are propagated
 * across all instances via Redis pub/sub, and the cache is initialized
 * from Redis on construction.
 *
 * Synchronous methods (addRevoked, isRevoked, clear) operate on the
 * in-memory Set only. Async variants (addRevokedAsync, isRevokedAsync,
 * clearAsync) also synchronize with Redis.
 */
export class CrlCache {
	private _revoked = new Set<string>();
	private _redis: CrlRedisClient | null = null;
	private _redisChannelCleanup: (() => void) | null = null;

	constructor(redisClient?: CrlRedisClient) {
		if (redisClient) {
			this._redis = redisClient;
		}
	}

	/** Configure Redis client post-construction (for global singleton). */
	setRedisClient(client: CrlRedisClient): void {
		this._redis = client;
	}

	/** Force-initialize from Redis (blocking). Call during service bootstrap. */
	async initialize(): Promise<void> {
		if (this._redis) {
			await this._initFromRedis();
			await this._subscribeToRedis();
		} else if (process.env.NODE_ENV === "production") {
			logger.error(
				"CrlCache: Redis client required in production for cross-instance CRL sync"
			);
			throw new Error(
				"REDIS_URL must be configured for CRL cache in production"
			);
		}
	}

	/**
	 * Mark a certificate as revoked in the local cache.
	 */
	addRevoked(serialNumber: string): void {
		this._revoked.add(serialNumber.toUpperCase());
	}

	/**
	 * Mark a certificate as revoked in local cache + Redis (fire-and-forget).
	 */
	async addRevokedAsync(serialNumber: string): Promise<void> {
		const sn = serialNumber.toUpperCase();
		this._revoked.add(sn);
		if (this._redis) {
			try {
				await this._redis.sadd(CRL_REDIS_SET_KEY, sn);
				await this._redis.publish(CRL_REDIS_CHANNEL, sn);
			} catch {
				// Redis failure is non-fatal for CRL cache
			}
		}
	}

	/**
	 * Returns true if the given serial number has been revoked.
	 * Checks local cache only (sync). Use isRevokedAsync for Redis-backed check.
	 */
	isRevoked(serialNumber: string): boolean {
		return this._revoked.has(serialNumber.toUpperCase());
	}

	/**
	 * Returns true if the given serial number has been revoked.
	 * Checks local cache first, then Redis if configured.
	 */
	async isRevokedAsync(serialNumber: string): Promise<boolean> {
		const sn = serialNumber.toUpperCase();
		if (this._revoked.has(sn)) {
			return true;
		}
		if (this._redis) {
			try {
				const inRedis = await this._redis.sismember(CRL_REDIS_SET_KEY, sn);
				if (inRedis) {
					this._revoked.add(sn);
					return true;
				}
			} catch {
				// Redis failure is non-fatal
			}
		}
		return false;
	}

	/**
	 * Returns true if the cache contains no revoked serials.
	 */
	get size(): number {
		return this._revoked.size;
	}

	/**
	 * Removes all entries from the local cache.
	 */
	clear(): void {
		this._revoked.clear();
	}

	/**
	 * Removes all entries from local cache and Redis.
	 */
	async clearAsync(): Promise<void> {
		this._revoked.clear();
		if (this._redis) {
			try {
				await this._redis.del(CRL_REDIS_SET_KEY);
			} catch {
				// Redis failure is non-fatal
			}
		}
	}

	/**
	 * Cleanup Redis subscriptions.
	 */
	destroy(): void {
		if (this._redisChannelCleanup) {
			this._redisChannelCleanup();
			this._redisChannelCleanup = null;
		}
		this._redis = null;
		this._revoked.clear();
	}

	private async _initFromRedis(): Promise<void> {
		if (!this._redis) {
			return;
		}
		const members = await this._redis.smembers(CRL_REDIS_SET_KEY);
		for (const member of members) {
			this._revoked.add(member.toUpperCase());
		}
		logger.info("CrlCache initialized from Redis", { context: { count: members.length } });
	}

	private async _subscribeToRedis(): Promise<void> {
		if (!this._redis) {
			return;
		}
		await this._redis.subscribe(
			CRL_REDIS_CHANNEL,
			(_channel: string, message: string) => {
				this._revoked.add(message.toUpperCase());
			}
		);
		this._redisChannelCleanup = async () => {
			try {
				await this._redis?.unsubscribe(CRL_REDIS_CHANNEL);
			} catch {
				// best effort
			}
		};
		logger.info("CrlCache subscribed to Redis CRL updates");
	}
}

/**
 * Singleton shared across all services in the same process.
 * Initialize via globalCrlCache.initialize() during bootstrap.
 */
export const GLOBAL_CRL_CACHE = new CrlCache();
