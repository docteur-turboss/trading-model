import type { ServiceIdentity } from "@trading-model/common/contracts/message.types";
import type { TopicSubscription } from "./messaging-types";

export interface SubscriptionEntry {
	topic: string;
	callbackPath: string;
	serviceIdentity: ServiceIdentity;
}

export interface ISubscriptionManager {
	add(
		topic: string,
		callbackPath: string,
		serviceIdentity: ServiceIdentity
	): Promise<void> | void;
	remove(sub: TopicSubscription): Promise<void> | void;
	getByTopic(
		topic: string
	): Promise<readonly SubscriptionEntry[]> | readonly SubscriptionEntry[];
}
