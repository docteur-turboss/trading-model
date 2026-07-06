import type Redis from "ioredis";

import { RedisSubscriptionKeys } from "./redis-subscription-keys";

export class SubscriptionCleanupHandler {
	private readonly _keys: RedisSubscriptionKeys;

	constructor(prefix: string) {
		this._keys = new RedisSubscriptionKeys(prefix);
	}

	buildRemovePipeline(
		redis: Redis,
		topic: string,
		instanceId: string,
		subKey: string
	): ReturnType<Redis["multi"]> {
		const multi = redis.multi();
		multi.del(subKey);
		multi.srem(this._keys.topicKey(topic), instanceId);
		multi.srem(this._keys.instanceKey(instanceId), topic);
		multi.hdel(this._keys.leaseKey(instanceId), topic);
		multi.scard(this._keys.instanceKey(instanceId));
		multi.scard(this._keys.topicKey(topic));
		return multi;
	}

	async cleanupInstanceIfEmpty(
		redis: Redis,
		results: [Error | null, unknown][],
		instanceId: string
	): Promise<void> {
		const instanceScard = results[results.length - 2];
		if (this._isZeroScard(instanceScard)) {
			try {
				return redis
					.srem(this._keys.activeInstancesKey(), instanceId)
					.then(() => {});
			} catch {
				/* best-effort */
			}
		}
		return Promise.resolve();
	}

	async cleanupTopicIfEmpty(
		redis: Redis,
		results: [Error | null, unknown][],
		topic: string
	): Promise<void> {
		const scardResult = results[results.length - 1];
		if (this._isZeroScard(scardResult)) {
			try {
				await redis.srem(this._keys.topicsSetKey(), topic);
			} catch {
				/* best-effort */
			}
		}
	}

	private _isZeroScard(
		result: [Error | null, unknown]
	): boolean {
		return result[0] === null && typeof result[1] === "number" && (result[1] as number) === 0;
	}
}
