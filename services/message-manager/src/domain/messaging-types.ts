import type { InstanceId, Topic } from "@trading-model/primitives/primitives";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";

export interface TopicSubscription {
	topic: Topic;
	instanceId: InstanceId;
}

export type SubscriptionParams = TopicBinding;
