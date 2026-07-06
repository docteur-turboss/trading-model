import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis from "ioredis";
import type { CacheManager } from "./cache-manager";

export class PubSubInvalidator {
	private _pubSub?: Redis;
	private readonly _redisUrlForPubSub?: string;

	constructor(redisUrlForPubSub?: string) {
		this._redisUrlForPubSub = redisUrlForPubSub;
	}

	get client(): Redis | undefined {
		return this._pubSub;
	}

	private _onPubSubMessage(cacheManager: CacheManager, channel: string, message: string): void {
		if (channel === "cache:invalidate") {
			cacheManager.invalidate(message);
			logger.debug("Cache invalidated via Pub/Sub", { serviceName: message });
		}
	}

	private async _setupPubSub(cacheManager: CacheManager): Promise<void> {
		this._pubSub = new Redis(this._redisUrlForPubSub!, {
			lazyConnect: true, maxRetriesPerRequest: 3,
		});
		await this._pubSub.connect();
		this._pubSub.on("message", (ch: string, msg: string) => this._onPubSubMessage(cacheManager, ch, msg));
		await this._pubSub.subscribe("cache:invalidate");
		logger.info("Redis Pub/Sub connected for cache invalidation");
	}

	async start(cacheManager: CacheManager): Promise<void> {
		if (!this._redisUrlForPubSub || this._pubSub) return;
		try {
			await this._setupPubSub(cacheManager);
		} catch (err) {
			logger.error("Failed to connect Redis Pub/Sub for cache invalidation", { error: normalizeError(err) });
		}
	}

	async publish(serviceName: string): Promise<void> {
		if (this._pubSub?.status !== "ready") {
			return;
		}
		try {
			await this._pubSub.publish("cache:invalidate", serviceName);
		} catch (err) {
			logger.warn("Failed to publish cache invalidation", {
				serviceName,
				error: normalizeError(err),
			});
		}
	}

	stop(): void {
		if (this._pubSub) {
			try {
				this._pubSub.unsubscribe("cache:invalidate");
			} catch {
				/* ignore */
			}
			try {
				this._pubSub.disconnect();
			} catch {
				/* ignore */
			}
			this._pubSub = undefined;
		}
	}
}
