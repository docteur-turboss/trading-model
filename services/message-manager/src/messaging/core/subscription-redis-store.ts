import type { ServiceIdentity } from "@trading-model/common/contracts/message.types";

import { SubscriptionRedisReader } from "./subscription-redis-reader";
import { SubscriptionRedisWriter } from "./subscription-redis-writer";

export interface SubscriptionEntry {
	id: string;
	topic: string;
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

	async add(
		topic: string,
		callbackPath: string,
		serviceIdentity: ServiceIdentity
	): Promise<void> {
		return this._writer.add(topic, callbackPath, serviceIdentity);
	}

	async remove(topic: string, instanceId: string): Promise<void> {
		return this._writer.remove(topic, instanceId);
	}

	async getByTopic(topic: string): Promise<SubscriptionEntry[]> {
		return this._reader.getByTopic(topic);
	}

	async getTopicsByInstance(instanceId: string): Promise<string[]> {
		return this._reader.getTopicsByInstance(instanceId);
	}

	async getAllTopics(): Promise<string[]> {
		return this._reader.getAllTopics();
	}
}
