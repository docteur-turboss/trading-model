import type { Topic } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/validation/contracts/message.types";
import type { TopicSubscription } from "./messaging-types";

export interface SubscriptionEntry {
	topic: Topic;
	callbackPath: string;
	serviceIdentity: ServiceIdentity;
}

export interface ISubscriptionManager {
	add(
		topic: Topic,
		callbackPath: string,
		serviceIdentity: ServiceIdentity
	): Promise<void> | void;
	remove(sub: TopicSubscription): Promise<void> | void;
	getByTopic(
		topic: Topic
	): Promise<readonly SubscriptionEntry[]> | readonly SubscriptionEntry[];
}
