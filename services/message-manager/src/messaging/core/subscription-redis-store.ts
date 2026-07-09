import type { ServiceIdentity } from "@trading-model/common/contracts/message.types";
import type { Topic } from "@trading-model/common/domain/primitives";

import type { TopicSubscription } from "./messaging-types";
import { SubscriptionRedisReader } from "./subscription-redis-reader";
import { SubscriptionRedisWriter } from "./subscription-redis-writer";

export interface SubscriptionEntry {
	id: string;
	topic: Topic;
	callbackPath: string;
	serviceIdentity: ServiceIdentity;
	createdAt: string;
}

export class SubscriptionRedisStore {
	private _reader: SubscriptionRedisReader;
	private _writer: SubscriptionRedisWriter;

	constructor(prefix: string) {
		this._reader = new SubscriptionRedisReader(prefix);
		this._writer = new SubscriptionRedisWriter(prefix);
	}

	add(
		topic: string,
		callbackPath: string,
		serviceIdentity: ServiceIdentity
	): Promise<void> {
		return this._writer.add(topic, callbackPath, serviceIdentity);
	}

	remove(sub: TopicSubscription): Promise<void> {
		return this._writer.remove(sub);
	}

	getByTopic(topic: string): Promise<SubscriptionEntry[]> {
		return this._reader.getByTopic(topic);
	}

	getTopicsByInstance(instanceId: string): Promise<string[]> {
		return this._reader.getTopicsByInstance(instanceId);
	}

	getAllTopics(): Promise<string[]> {
		return this._reader.getAllTopics();
	}
}
