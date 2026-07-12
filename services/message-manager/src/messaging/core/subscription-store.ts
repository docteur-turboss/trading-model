import type {
	InstanceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import { ENV } from "../../config/env";
import { getSubscriptionClient } from "../../config/redis";
import { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import { InstanceLifecycleManager } from "./instance-lifecycle-manager";
import { LEASE_HEARTBEAT_FIELD } from "./messaging-constants";
import type { SubscriptionParams, TopicSubscription } from "./messaging-types";
import {
	type SubscriptionEntry,
	SubscriptionRedisStore,
} from "./subscription-redis-store";

export type { SubscriptionEntry };
export { LEASE_HEARTBEAT_FIELD };

export class SubscriptionStore {
	private _redisStore: SubscriptionRedisStore;
	private _lifecycleManager: InstanceLifecycleManager;

	constructor() {
		const keys = new RedisKeyBuilder(ENV.REDIS_PREFIX);
		this._redisStore = new SubscriptionRedisStore(keys);
		this._lifecycleManager = new InstanceLifecycleManager(keys);
	}

	add(params: SubscriptionParams): Promise<void> {
		return this._redisStore.add(params);
	}

	remove(sub: TopicSubscription): Promise<void> {
		return this._redisStore.remove(sub);
	}

	getByTopic(topic: Topic): Promise<SubscriptionEntry[]> {
		return this._redisStore.getByTopic(topic);
	}

	getTopicsByInstance(instanceId: InstanceId): Promise<string[]> {
		return this._redisStore.getTopicsByInstance(instanceId);
	}

	getAllTopics(): Promise<string[]> {
		return this._redisStore.getAllTopics();
	}

	renewLease(instanceId: InstanceId, topics: Topic[]): Promise<void> {
		return this._lifecycleManager.renewLease(instanceId, topics);
	}

	heartbeat(instanceId: InstanceId): Promise<void> {
		return this._lifecycleManager.heartbeat(instanceId);
	}

	isStaleByHeartbeat(instanceId: InstanceId): Promise<boolean> {
		return this._lifecycleManager.isStaleByHeartbeat(instanceId);
	}

	removeStaleInstances(): Promise<number> {
		return this._lifecycleManager.removeStaleInstances();
	}

	async healthCheck(): Promise<boolean> {
		try {
			const redis = await getSubscriptionClient();
			await redis.ping();
			return true;
		} catch {
			return false;
		}
	}
}

export const subscriptionStore = new SubscriptionStore();
