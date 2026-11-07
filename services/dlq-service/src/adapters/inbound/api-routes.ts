import {
	brand,
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import { toTopic } from "@trading-model/primitives/primitives";
import { DlqEntryWire } from "@trading-model/validation/wire/dlq-entry";
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
	.transform(brand((topic?: string) => (topic ? toTopic(topic) : undefined)));

const StoredDlqEntry = z.object({
	id: z.string(),
	topic: z.string().nullable(),
	message: z.unknown(),
	service: z.string().nullable(),
	reason: z.string().nullable(),
	deliveryAttempt: z.number().int(),
	createdAt: z.iso.datetime(),
});

const StorageUnavailable = ErrorResponse.extend({
	code: z.literal("STORAGE_UNAVAILABLE"),
});

/** Rejections of `serviceAuth`: unknown caller (403), bad signature (401). */
const SIGNED = { 401: ErrorResponse, 403: ErrorResponse } as const;

export const DLQ_API = {
	addEntry: defineRoute({
		method: "POST",
		path: "/dlq",
		summary: "Store a dead-lettered message",
		security: ["SignedRequest"],
		body: DlqEntryWire,
		responses: {
			201: z.object({ id: z.string() }),
			400: ErrorResponse,
			...SIGNED,
			429: ErrorResponse,
			503: StorageUnavailable,
		},
	}),
	listEntries: defineRoute({
		method: "GET",
		path: "/dlq",
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
		path: "/dlq",
		summary: "Delete entries by id",
		security: ["SignedRequest"],
		body: z.object({ ids: z.array(z.string()).min(1).max(1000) }),
		responses: {
			200: z.object({ deleted: z.number().int() }),
			400: ErrorResponse,
			...SIGNED,
			429: ErrorResponse,
		},
	}),
	replayEntries: defineRoute({
		method: "POST",
		path: "/dlq/replay",
		summary: "Replay a batch of entries to message-manager",
		security: ["SignedRequest"],
		query: z.object({
			topic: OPTIONAL_TOPIC,
			limit: z.coerce.number().int().positive().max(100).default(50),
			batchId: z.string().optional(),
		}),
		responses: {
			200: z.union([
				z.object({
					batchId: z.string(),
					replayed: z.number().int(),
					failed: z.number().int(),
					errors: z
						.array(z.object({ id: z.string(), error: z.string() }))
						.optional(),
				}),
				z.object({ replayed: z.literal(0), message: z.string() }),
			]),
			400: ErrorResponse,
			...SIGNED,
			429: ErrorResponse,
			500: ErrorResponse,
		},
	}),
} as const;

export type ListEntriesQuery = z.output<typeof DLQ_API.listEntries.query>;
export type DeleteEntriesBody = z.output<typeof DLQ_API.deleteEntries.body>;
export type ReplayEntriesQuery = z.output<typeof DLQ_API.replayEntries.query>;
