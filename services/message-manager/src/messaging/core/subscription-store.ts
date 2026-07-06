import { ENV } from "../../config/env";
import { getSubscriptionClient } from "../../config/redis";
import {
	InstanceLifecycleManager,
	LEASE_HEARTBEAT_FIELD,
} from "./instance-lifecycle-manager";
import type { ServiceIdentity } from "@trading-model/common/contracts/message.types";
import {
	SubscriptionEntry,
	SubscriptionRedisStore,
} from "./subscription-redis-store";

export { LEASE_HEARTBEAT_FIELD };
export type { SubscriptionEntry };

export class SubscriptionStore {
	private _redisStore: SubscriptionRedisStore;
	private _lifecycleManager: InstanceLifecycleManager;

	constructor() {
		const prefix = ENV.REDIS_PREFIX;
		this._redisStore = new SubscriptionRedisStore(prefix);
		this._lifecycleManager = new InstanceLifecycleManager(prefix);
	}

	add(
		topic: string,
		callbackPath: string,
		serviceIdentity: ServiceIdentity
	): Promise<void> {
		return this._redisStore.add(topic, callbackPath, serviceIdentity);
	}

	remove(topic: string, instanceId: string): Promise<void> {
		return this._redisStore.remove(topic, instanceId);
	}

	getByTopic(topic: string): Promise<SubscriptionEntry[]> {
		return this._redisStore.getByTopic(topic);
	}

	getTopicsByInstance(instanceId: string): Promise<string[]> {
		return this._redisStore.getTopicsByInstance(instanceId);
	}

	getAllTopics(): Promise<string[]> {
		return this._redisStore.getAllTopics();
	}

	renewLease(instanceId: string, topics: string[]): Promise<void> {
		return this._lifecycleManager.renewLease(instanceId, topics);
	}

	heartbeat(instanceId: string): Promise<void> {
		return this._lifecycleManager.heartbeat(instanceId);
	}

	isStaleByHeartbeat(instanceId: string): Promise<boolean> {
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
