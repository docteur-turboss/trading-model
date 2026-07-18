import type {
	InstanceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { TopicBinding } from "@trading-model/common/domain/topic-binding";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";

import type { SubscriptionParams, TopicSubscription } from "./messaging-types";
import { SubscriptionRedisReader } from "./subscription-redis-reader";
import { SubscriptionRedisWriter } from "./subscription-redis-writer";

export interface SubscriptionEntry extends TopicBinding {
	id: string;
	createdAt: string;
}

export class SubscriptionRedisStore {
	private _reader: SubscriptionRedisReader;
	private _writer: SubscriptionRedisWriter;

	constructor(keys: RedisKeyBuilder) {
		this._reader = new SubscriptionRedisReader(keys);
		this._writer = new SubscriptionRedisWriter(keys);
	}

	add(params: SubscriptionParams): Promise<void> {
		return this._writer.add(params);
	}

	remove(sub: TopicSubscription): Promise<void> {
		return this._writer.remove(sub);
	}

	getByTopic(topic: Topic): Promise<SubscriptionEntry[]> {
		return this._reader.getByTopic(topic);
	}

	getTopicsByInstance(instanceId: InstanceId): Promise<string[]> {
		return this._reader.getTopicsByInstance(instanceId);
	}

	getAllTopics(): Promise<string[]> {
		return this._reader.getAllTopics();
	}
}
