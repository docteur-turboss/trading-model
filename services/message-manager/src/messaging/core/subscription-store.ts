import type { ServiceIdentity } from "@trading-model/common/contracts/message.types";
import type { Topic, InstanceId } from "@trading-model/common/domain/primitives";
import { ENV } from "../../config/env";
import { getSubscriptionClient } from "../../config/redis";
import { InstanceLifecycleManager } from "./instance-lifecycle-manager";
import { LEASE_HEARTBEAT_FIELD } from "./messaging-constants";
import type { TopicSubscription } from "./messaging-types";
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
		const prefix = ENV.REDIS_PREFIX;
		this._redisStore = new SubscriptionRedisStore(prefix);
		this._lifecycleManager = new InstanceLifecycleManager(prefix);
	}

	add(
		topic: Topic,
		callbackPath: string,
		serviceIdentity: ServiceIdentity
	): Promise<void> {
		return this._redisStore.add(topic, callbackPath, serviceIdentity);
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
