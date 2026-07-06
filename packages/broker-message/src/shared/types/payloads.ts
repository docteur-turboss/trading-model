import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { Topic } from "@trading-model/common/domain/primitives";

/** Payload sent when subscribing to a topic. */
export interface SubscribesTopicsPayload {
	topic: Topic;
	callbackPath: string;
	consumerIdentity: {
		serviceName: ServiceInstanceName;
		instanceId: string;
	};
}

/** Payload sent when unsubscribing from a topic. */
export interface UnSubscribesTopicsPayload {
	topic: Topic;
	instanceId: string;
}
