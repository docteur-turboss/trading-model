import { brand } from "@trading-model/contracts/wire/brand";
import {
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/api-route/api-route";
import { Topic } from "@trading-model/primitives/primitives";
import { z } from "zod";

/**
 * HTTP API of dlq-service (ADR-0021): each entry mounts its route
 * (`routes.ts`), validates its input and documents it in the OpenAPI.
 * Every route needs a signed request (`serviceAuth`); health and metrics are
 * infrastructure routes, outside the registry.
 */

/** An empty topic means "every topic", as before the registry. */
const OPTIONAL_TOPIC = z
	.string()
	.optional()
	.transform(brand((topic?: string) => (topic ? Topic.of(topic) : undefined)));

const StoredDlqEntry = z.object({
	id: z.string(),
	topic: z.string().nullable(),
	message: z.unknown(),
	service: z.string().nullable(),
	reason: z.string().nullable(),
	deliveryAttempt: z.number().int(),
	createdAt: z.iso.datetime(),
});

const DELETED = z.object({ deleted: z.number().int() });

const REPLAYED = z.object({
	batchId: z.string(),
	replayed: z.number().int(),
	failed: z.number().int(),
	errors: z.array(z.object({ id: z.string(), error: z.string() })).optional(),
});

/** Rejections of `serviceAuth`: unknown caller (403), bad signature (401). */
const SIGNED = { 401: ErrorResponse, 403: ErrorResponse } as const;

export const DLQ_API = {
	listEntries: defineRoute({
		method: "GET",
		path: "/v1/dlq",
		summary: "List stored entries, newest first",
		security: ["SignedRequest"],
		query: z.object({
			topic: OPTIONAL_TOPIC,
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.default(10)
				.transform((limit) => Math.min(limit, 1000)),
			offset: z.coerce.number().int().min(0).default(0),
			/** Id of the last entry of the previous page; replaces `offset`. */
			cursor: z.string().min(1).optional(),
		}),
		responses: {
			200: z.object({
				entries: z.array(StoredDlqEntry),
				count: z.number().int(),
				hasMore: z.boolean(),
				offset: z.number().int().optional(),
				cursor: z.string().optional(),
			}),
			400: ErrorResponse,
			...SIGNED,
		},
	}),
	deleteEntries: defineRoute({
		method: "DELETE",
		path: "/v1/dlq",
		summary: "Delete entries by id",
		security: ["SignedRequest"],
		body: z.object({ ids: z.array(z.string()).min(1).max(1000) }),
		responses: {
			200: DELETED.extend({ auditRecorded: z.literal(true) }),
			400: ErrorResponse,
			...SIGNED,
			429: ErrorResponse,
			/** Deleted, but message-manager refused the audit event (ADR-0059). */
			502: DELETED.extend({ auditRecorded: z.literal(false) }),
		},
	}),
	replayEntries: defineRoute({
		method: "POST",
		path: "/v1/dlq/replay",
		summary: "Replay a batch of entries to message-manager",
		security: ["SignedRequest"],
		query: z.object({
			topic: OPTIONAL_TOPIC,
			limit: z.coerce.number().int().positive().max(100).default(50),
			batchId: z.string().optional(),
		}),
		responses: {
			200: z.union([
				REPLAYED,
				z.object({ replayed: z.literal(0), message: z.string() }),
			]),
			400: ErrorResponse,
			...SIGNED,
			429: ErrorResponse,
			500: ErrorResponse,
			/** Replayed, but message-manager refused the audit event (ADR-0059). */
			502: REPLAYED.extend({ auditRecorded: z.literal(false) }),
		},
	}),
} as const;

export type ListEntriesQuery = z.output<typeof DLQ_API.listEntries.query>;
export type DeleteEntriesBody = z.output<typeof DLQ_API.deleteEntries.body>;
export type ReplayEntriesQuery = z.output<typeof DLQ_API.replayEntries.query>;
