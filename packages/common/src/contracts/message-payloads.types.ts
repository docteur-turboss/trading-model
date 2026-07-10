import type { Topic, URLString } from "../domain/primitives";

/** Payload for subscribing a service to a set of topics. */
export interface TopicsSubscribePayload {
	topics: Topic[];
	callbackUrl: URLString;
}

/** Payload for unsubscribing a service from a set of topics. */
export interface TopicsUnsubscribePayload {
	topics: Topic[];
}
