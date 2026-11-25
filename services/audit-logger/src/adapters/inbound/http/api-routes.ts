import { brand } from "@trading-model/contracts/wire/brand";
import {
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/api-route/api-route";
import {
	CorrelationId,
	ServiceId,
	Topic,
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

export const AUDIT_API = {
	listEvents: defineRoute({
		method: "GET",
		path: "/v1/events",
		summary: "List stored events, newest first",
		query: z.object({
			topic: optionalFilter(Topic.of),
			publisher: optionalFilter(ServiceId.of),
			correlationId: optionalFilter(CorrelationId.of),
			/** Inclusive bounds on `receivedAt`. */
			startDate: DATE.optional(),
			endDate: DATE.optional(),
			/** `true` adds `total` (a count, O(n) on a broad filter). Default: no count. */
			withTotal: z
				.enum(["true", "false"])
				.optional()
				.transform((value) => value === "true"),
			/** Cursor: the `nextCursor` of the previous page. */
			before: z.coerce.number().int().min(1).optional(),
			limit: z.coerce.number().int().min(1).optional(),
		}),
		responses: {
			200: z.object({
				docs: z.array(AuditEvent),
				/** Only with `withTotal=true`. Without filter: an estimate. */
				total: z.number().int().optional(),
				/** `before` of the next page; null on the last one. */
				nextCursor: z.number().int().nullable(),
				limit: z.number().int(),
			}),
			400: ErrorResponse,
		},
	}),
	getStats: defineRoute({
		method: "GET",
		path: "/v1/events/stats",
		summary: "Event counts by topic and publisher",
		responses: {
			200: z.object({
				/** Live count (estimate). The two breakdowns cover the last 24 h only and are refreshed at most every 60 s, so their sums can differ from it. */
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
		path: "/v1/events/:messageId",
		summary: "One event by message id",
		params: z.object({ messageId: z.string().min(1) }),
		responses: { 200: AuditEvent, 400: ErrorResponse, 404: ErrorResponse },
	}),
} as const;

export type ListEventsQuery = z.output<typeof AUDIT_API.listEvents.query>;
