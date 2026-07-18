import type {
	InstanceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import type Redis from "ioredis";
import { logger } from "../../config/logger";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";

import type { TopicSubscription } from "./messaging-types";
import { RedisSubscriptionKeys } from "./redis-subscription-keys";

export class SubscriptionCleanupHandler {
	private readonly _keys: RedisSubscriptionKeys;

	constructor(keys: RedisKeyBuilder) {
		this._keys = new RedisSubscriptionKeys(keys);
	}

	buildRemovePipeline(
		redis: Redis,
		sub: TopicSubscription,
		subKey: string
	): ReturnType<Redis["multi"]> {
		const multi = redis.multi();
		multi.del(subKey);
		multi.srem(this._keys.topicKey(sub.topic), sub.instanceId);
		multi.srem(this._keys.instanceKey(sub.instanceId), sub.topic);
		multi.hdel(this._keys.leaseKey(sub.instanceId), sub.topic);
		multi.scard(this._keys.instanceKey(sub.instanceId));
		multi.scard(this._keys.topicKey(sub.topic));
		return multi;
	}

	cleanupInstanceIfEmpty(
		redis: Redis,
		results: [Error | null, unknown][],
		instanceId: InstanceId
	): void {
		const instanceScard = results[results.length - 2];
		if (this._isZeroScard(instanceScard)) {
			redis.srem(this._keys.activeInstancesKey(), instanceId).catch((err) => {
				logger.warn("Failed to cleanup empty instance", {
					instanceId,
					err: (err as Error).message,
				});
			});
		}
	}

	async cleanupTopicIfEmpty(
		redis: Redis,
		results: [Error | null, unknown][],
		topic: Topic
	): Promise<void> {
		const scardResult = results[results.length - 1];
		if (this._isZeroScard(scardResult)) {
			try {
				await redis.srem(this._keys.topicsSetKey(), topic);
			} catch (err) {
				logger.warn("Failed to cleanup empty topic", {
					topic,
					err: (err as Error).message,
				});
			}
		}
	}

	private _isZeroScard(result: [Error | null, unknown]): boolean {
		return (
			result[0] === null &&
			typeof result[1] === "number" &&
			(result[1] as number) === 0
		);
	}
}
