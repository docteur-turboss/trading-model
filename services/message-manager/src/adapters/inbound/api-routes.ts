import {
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import {
	PUBLISH_SCHEMA,
	SUBSCRIBE_SCHEMA,
	UNSUBSCRIBE_SCHEMA,
} from "./validation/broker.schema";

/**
 * HTTP API of message-manager (ADR-0021, ADR-0019): service-to-service only,
 * called by the broker client of every service over mTLS. Each entry mounts
 * its route (`http.routes.ts`), validates its body and documents it in the
 * internal OpenAPI.
 */
const REJECTED = { 400: ErrorResponse, 429: ErrorResponse } as const;

export const BROKER_API = {
	publish: defineRoute({
		method: "POST",
		path: "/message",
		summary:
			"Publish a message: answered once every subscriber acknowledged, dead-lettered or gave up (ADR-0019)",
		body: PUBLISH_SCHEMA,
		responses: { 204: null, ...REJECTED },
	}),
	subscribe: defineRoute({
		method: "POST",
		path: "/subscribe",
		summary:
			"Subscribe an instance to a topic, or renew its subscription (expires 60 s after the last renewal)",
		body: SUBSCRIBE_SCHEMA,
		responses: { 204: null, ...REJECTED },
	}),
	unsubscribe: defineRoute({
		method: "DELETE",
		path: "/subscribe",
		summary: "Remove the subscription of an instance to a topic",
		body: UNSUBSCRIBE_SCHEMA,
		responses: { 204: null, ...REJECTED },
	}),
} as const;
