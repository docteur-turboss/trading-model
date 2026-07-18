import type { Topic } from "@trading-model/common/domain/primitives";
import type { TopicBinding } from "@trading-model/common/domain/topic-binding";
import type { TopicSubscription } from "./messaging-types";

export type SubscriptionEntry = TopicBinding;

export interface ISubscriptionManager {
	add(entry: SubscriptionEntry): Promise<void> | void;
	remove(sub: TopicSubscription): Promise<void> | void;
	getByTopic(
		topic: Topic
	): Promise<readonly SubscriptionEntry[]> | readonly SubscriptionEntry[];
}
