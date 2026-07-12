import {
	type InstanceId,
	type Topic,
	toInstanceId,
	toTopic,
} from "@trading-model/common/domain/primitives";
import type Redis from "ioredis";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";

import { LEASE_HEARTBEAT_FIELD } from "./messaging-constants";
import { RedisSubscriptionKeys } from "./redis-subscription-keys";

export class StaleInstanceRemover {
	private readonly _keys: RedisSubscriptionKeys;

	constructor(keys: RedisKeyBuilder) {
		this._keys = new RedisSubscriptionKeys(keys);
	}

	async removeSubscriptions(
		redis: Redis,
		instanceId: InstanceId
	): Promise<string[]> {
		const leaseKey = this._keys.leaseKey(instanceId);
		const topics = await redis.hkeys(leaseKey);
		const multi = redis.multi();
		this._addRemovalCommands(multi, instanceId, leaseKey, topics);
		await multi.exec();
		return topics;
	}

	private _addRemovalCommands(
		multi: ReturnType<Redis["multi"]>,
		instanceId: InstanceId,
		leaseKey: string,
		topics: Topic[]
	): void {
		for (const topic of topics) {
			if (topic === LEASE_HEARTBEAT_FIELD) {
				continue;
			}
			multi.del(
				this._keys.subKey({
					topic: toTopic(topic),
					instanceId: toInstanceId(instanceId),
				})
			);
			multi.srem(this._keys.topicKey(topic), instanceId);
		}
		multi.del(leaseKey);
		multi.del(this._keys.instanceKey(instanceId));
		multi.srem(this._keys.activeInstancesKey(), instanceId);
	}

	async cleanupOrphanedTopics(redis: Redis, topics: Topic[]): Promise<void> {
		for (const topic of topics) {
			if (topic === LEASE_HEARTBEAT_FIELD) {
				continue;
			}
			try {
				const remaining = await redis.scard(this._keys.topicKey(topic));
				if (remaining === 0) {
					await redis.srem(this._keys.topicsSetKey(), topic);
				}
			} catch {}
		}
	}
}
