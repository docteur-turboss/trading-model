import type { Topic } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";

/** Payload sent when subscribing to a topic. */
export interface SubscribesTopicsPayload {
	topic: Topic;
	callbackPath: string;
	consumerIdentity: ServiceIdentity;
}

/** Payload sent when unsubscribing from a topic. */
export interface UnSubscribesTopicsPayload {
	topic: Topic;
	instanceId: string;
}
