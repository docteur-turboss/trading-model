/** Payload for subscribing a service to a set of topics. */
export interface SubscribesTopicsPayload {
	topics: string[];
	callbackUrl: string;
}

/** Payload for unsubscribing a service from a set of topics. */
export interface UnSubscribesTopicsPayload {
	topics: string[];
}

/** Configuration required for a service to connect to the message broker. */
export interface BrokerConfig {
	serviceName: string;
	callbackPath: string;
	instanceId: string;
}
