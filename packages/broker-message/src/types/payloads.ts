import type { InstanceId, Topic } from "@trading-model/primitives/primitives";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";

/** Payload sent when subscribing to a topic. */
export type SubscribesTopicsPayload = TopicBinding;

/** Payload sent when unsubscribing from a topic. */
export interface UnSubscribesTopicsPayload {
	topic: Topic;
	instanceId: InstanceId;
}
