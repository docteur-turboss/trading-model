import type { ServiceInstanceName } from "@trading-model/common/config/services.types";

/** Payload sent when subscribing to a topic. */
export interface SubscribesTopicsPayload {
	topic: string;
	callbackPath: string;
	consumerIdentity: {
		serviceName: ServiceInstanceName;
		instanceId: string;
	};
}

/** Payload sent when unsubscribing from a topic. */
export interface UnSubscribesTopicsPayload {
	topic: string;
	instanceId: string;
}
