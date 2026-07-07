import type Redis from "ioredis";
import { LEASE_HEARTBEAT_FIELD } from "./messaging-constants";
import { RedisSubscriptionKeys } from "./redis-subscription-keys";

export class InstanceSubscriptionRemover {
	private readonly _keys: RedisSubscriptionKeys;

	constructor(prefix: string) {
		this._keys = new RedisSubscriptionKeys(prefix);
	}

	async removeSubscriptions(
		redis: Redis,
		instanceId: string
	): Promise<string[]> {
		const leaseKey = this._keys.leaseKey(instanceId);
		const topics = await redis.hkeys(leaseKey);
		const multi = redis.multi();
		for (const topic of topics) {
			if (topic === LEASE_HEARTBEAT_FIELD) {
				continue;
			}
			multi.del(this._keys.subKey({ topic, instanceId }));
			multi.srem(this._keys.topicKey(topic), instanceId);
		}
		multi.del(leaseKey);
		multi.del(this._keys.instanceKey(instanceId));
		multi.srem(this._keys.activeInstancesKey(), instanceId);
		await multi.exec();
		return topics;
	}

	async cleanupOrphanedTopics(redis: Redis, topics: string[]): Promise<void> {
		for (const topic of topics) {
			if (topic === LEASE_HEARTBEAT_FIELD) {
				continue;
			}
			try {
				const remaining = await redis.scard(this._keys.topicKey(topic));
				if (remaining === 0) {
					await redis.srem(this._keys.topicsSetKey(), topic);
				}
			} catch {
				// best-effort cleanup
			}
		}
	}
}
