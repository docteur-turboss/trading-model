import { randomUUID } from "node:crypto";

import { toTopic } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/contracts/message.types";

import { getSubscriptionClient } from "../../config/redis";
import type { TopicSubscription } from "./messaging-types";
import { RedisSubscriptionKeys } from "./redis-subscription-keys";
import { SubscriptionCleanupHandler } from "./subscription-cleanup-handler";
import type { SubscriptionEntry } from "./subscription-redis-store";

const SUBSCRIPTION_TTL_MS = 30_000;

export class SubscriptionRedisWriter {
	private _keys: RedisSubscriptionKeys;
	private _cleanup: SubscriptionCleanupHandler;

	constructor(prefix: string) {
		this._keys = new RedisSubscriptionKeys(prefix);
		this._cleanup = new SubscriptionCleanupHandler(prefix);
	}

	async add(
		topic: string,
		callbackPath: string,
		serviceIdentity: ServiceIdentity
	): Promise<void> {
		const redis = await getSubscriptionClient();
		const subKey = this._keys.subKey({
			topic: toTopic(topic),
			instanceId: serviceIdentity.instanceId,
		});
		const exists = await redis.exists(subKey);
		if (exists) {
			return;
		}

		const entry: SubscriptionEntry = {
			id: randomUUID(),
			topic: toTopic(topic),
			callbackPath,
			serviceIdentity,
			createdAt: new Date().toISOString(),
		};

		const multi = redis.multi();
		multi.hset(subKey, "data", JSON.stringify(entry));
		multi.expire(subKey, Math.ceil(SUBSCRIPTION_TTL_MS / 1000));
		multi.sadd(this._keys.topicKey(topic), serviceIdentity.instanceId);
		multi.sadd(this._keys.instanceKey(serviceIdentity.instanceId), topic);
		multi.sadd(this._keys.topicsSetKey(), topic);
		multi.sadd(this._keys.activeInstancesKey(), serviceIdentity.instanceId);
		multi.hset(
			this._keys.leaseKey(serviceIdentity.instanceId),
			topic,
			Date.now().toString()
		);
		multi.expire(
			this._keys.leaseKey(serviceIdentity.instanceId),
			Math.ceil(SUBSCRIPTION_TTL_MS / 1000)
		);
		await multi.exec();
	}

	async remove(sub: TopicSubscription): Promise<void> {
		const redis = await getSubscriptionClient();
		const subKey = this._keys.subKey(sub);
		const multi = this._cleanup.buildRemovePipeline(redis, sub, subKey);
		const results = await multi.exec();
		if (!results) {
			return;
		}
		await this._cleanup.cleanupInstanceIfEmpty(redis, results, sub.instanceId);
		await this._cleanup.cleanupTopicIfEmpty(redis, results, sub.topic);
	}
}
