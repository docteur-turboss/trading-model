import {
	brand,
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import {
	toCorrelationId,
	toServiceId,
	toTopic,
} from "@trading-model/primitives/primitives";
import { z } from "zod";

/**
 * HTTP API of audit-logger (ADR-0021): read access to the audit trail
 * (public, `events.routes.ts`) and the broker callback that feeds it
 * (service-to-service, `application/server.ts`). Each entry mounts its route,
 * validates its input and documents it in the OpenAPI.
 */

/** An empty filter means "no filter", as before the registry. */
function optionalFilter<Out>(of: (value: string) => Out) {
	return z
		.string()
		.optional()
		.transform(brand((value?: string) => (value ? of(value) : undefined)));
}

const DATE = z.union([z.iso.datetime({ offset: true }), z.iso.date()]);
const DATE_TIME = z.iso.datetime();

/** A stored event, as `GET /events` and `GET /events/:messageId` send it. */
const AuditEvent = z.object({
	/** MongoDB ObjectId. */
	_id: z.string(),
	receivedAt: DATE_TIME,
	/** Expiry of the document (TTL index). */
	ttl: DATE_TIME,
	/** Hash chain (tamper evidence): sha256 of this event and `previousHash`. */
	dataHash: z.string(),
	previousHash: z.string(),
	chainSequence: z.number().int(),
	metadata: z.object({
		topic: z.string(),
		eventType: z.string(),
		publisher: z.string(),
		instanceId: z.string(),
		messageId: z.string(),
		correlationId: z.string().optional(),
	}),
	payload: z.unknown(),
});

/**
 * Metadata as delivered: the topic is required, every other field is kept as
 * sent (the audit records messages, it does not judge them).
 */
const DeliveredMetadata = z.looseObject({ topic: z.string().min(1) });

/** A delivery from message-manager, or the older envelope nested in `message`. */
const DeliveredEnvelope = z.union([
	z.looseObject({
		metadata: DeliveredMetadata,
		payload: z.unknown().optional(),
	}),
	z.looseObject({
		message: z.looseObject({
			metadata: DeliveredMetadata,
			payload: z.unknown().optional(),
		}),
	}),
]);

export const AUDIT_API = {
	receive: defineRoute({
		method: "POST",
		path: "/message",
		summary:
			"Record a message delivered by message-manager (every topic is subscribed)",
		body: DeliveredEnvelope,
		responses: {
			/** Acknowledges the delivery, a redelivery included (same messageId). */
			200: z.object({ status: z.literal("recorded") }),
			400: ErrorResponse,
		},
	}),
	listEvents: defineRoute({
		method: "GET",
		path: "/events",
		summary: "List stored events, newest first",
		query: z.object({
			topic: optionalFilter(toTopic),
			publisher: optionalFilter(toServiceId),
			correlationId: optionalFilter(toCorrelationId),
			/** Inclusive bounds on `receivedAt`. */
			startDate: DATE.optional(),
			endDate: DATE.optional(),
			page: z.coerce.number().int().min(1).optional(),
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.optional()
				.transform((limit) =>
					limit === undefined ? limit : Math.min(limit, 1000)
				),
		}),
		responses: {
			200: z.object({
				docs: z.array(AuditEvent),
				total: z.number().int(),
				page: z.number().int(),
				limit: z.number().int(),
			}),
			400: ErrorResponse,
		},
	}),
	getStats: defineRoute({
		method: "GET",
		path: "/events/stats",
		summary: "Event counts by topic and publisher",
		responses: {
			200: z.object({
				totalEvents: z.number().int(),
				eventsByTopic: z.record(z.string(), z.number().int()),
				eventsByPublisher: z.record(z.string(), z.number().int()),
				dateRange: z.object({
					earliest: DATE_TIME.nullable(),
					latest: DATE_TIME.nullable(),
				}),
			}),
		},
	}),
	getEvent: defineRoute({
		method: "GET",
		path: "/events/:messageId",
		summary: "One event by message id",
		params: z.object({ messageId: z.string().min(1) }),
		responses: { 200: AuditEvent, 400: ErrorResponse, 404: ErrorResponse },
	}),
} as const;

export type ListEventsQuery = z.output<typeof AUDIT_API.listEvents.query>;
