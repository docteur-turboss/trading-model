import {
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import { z } from "zod";
import {
	PUBLISH_SCHEMA,
	REPUBLISH_SCHEMA,
	SUBSCRIBE_SCHEMA,
	UNSUBSCRIBE_SCHEMA,
} from "./validation/broker.schema";

/**
 * HTTP API of message-manager (ADR-0021, ADR-0048): service-to-service only,
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
			"Publish a message: answered 202 once it is written to the durable journal, delivered to the subscribers afterwards (ADR-0048); 503 when the topic has no subscriber and delivery.requireSubscriber is set, or the journal cannot take it",
		body: PUBLISH_SCHEMA,
		responses: {
			202: z.object({ messageId: z.string() }),
			...REJECTED,
			503: ErrorResponse,
		},
	}),
	republish: defineRoute({
		method: "POST",
		path: "/message/replay",
		summary:
			"Replay a dead letter to the one service whose delivery failed, under its original messageId (ADR-0043); callable by dlq-service only",
		body: REPUBLISH_SCHEMA,
		responses: { 204: null, ...REJECTED, 503: ErrorResponse },
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
