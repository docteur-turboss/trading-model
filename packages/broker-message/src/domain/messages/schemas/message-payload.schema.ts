import type { EventEnumMap } from "@trading-model/contracts/event-map";
import { z } from "zod";

import { AUDIT_EVENT_VALIDATORS } from "./audit-event.schema";
import { DLQ_EVENT_VALIDATORS } from "./dlq-event.schema";
import { MARKET_EVENT_VALIDATORS } from "./market-event.schema";
import { TRAINING_EVENT_VALIDATORS } from "./training-event.schema";

/** Validators of every event payload, by event type. */
export const EVENT_VALIDATORS = {
	...MARKET_EVENT_VALIDATORS,
	...AUDIT_EVENT_VALIDATORS,
	...TRAINING_EVENT_VALIDATORS,
	...DLQ_EVENT_VALIDATORS,
	// satisfies: tsc fails when a topic of EventEnumMap has no validator.
} satisfies Record<EventEnumMap, z.ZodType>;

/** Schema of a message payload, discriminated by event type. */
export const MESSAGE_PAYLOAD_SCHEMA = z.discriminatedUnion(
	"type",
	Object.entries(EVENT_VALIDATORS).map(
		([type, schema]) =>
			z.object({
				type: z.literal(type),
				data: schema,
			})
		// as unknown as: Zod union needs a non-empty tuple type, built from a runtime list
	) as unknown as [z.ZodObject<z.ZodRawShape>, ...z.ZodObject<z.ZodRawShape>[]]
);

/** Payload of a message, as validated by MESSAGE_PAYLOAD_SCHEMA. */
export type MessagePayload = z.infer<typeof MESSAGE_PAYLOAD_SCHEMA>;
