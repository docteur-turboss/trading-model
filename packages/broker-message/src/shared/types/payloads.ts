import type {
	InstanceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { TopicBinding } from "@trading-model/common/domain/topic-binding";

/** Payload sent when subscribing to a topic. */
export interface SubscribesTopicsPayload extends TopicBinding {}

/** Payload sent when unsubscribing from a topic. */
export interface UnSubscribesTopicsPayload {
	topic: Topic;
	instanceId: InstanceId;
}
