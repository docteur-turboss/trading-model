import type { Topic } from "../domain/primitives";

/** Payload for subscribing a service to a set of topics. */
export interface SubscribesTopicsPayload {
	topics: Topic[];
	callbackUrl: string;
}

/** Payload for unsubscribing a service from a set of topics. */
export interface UnSubscribesTopicsPayload {
	topics: Topic[];
}


