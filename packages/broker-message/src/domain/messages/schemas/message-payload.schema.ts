import type { EventMap } from "@trading-model/contracts/event-map";
import { z } from "zod";

import { AUDIT_EVENT_VALIDATORS } from "./audit-event.schema";
import { MARKET_EVENT_VALIDATORS } from "./market-event.schema";

type ZodEventMap<TObject extends object> = {
	[TKey in keyof TObject]: [TObject[TKey]] extends [undefined]
		? z.ZodVoid
		: z.ZodType<TObject[TKey]>;
};

/** Validators of every event payload, by event type. */
export const EVENT_VALIDATORS = {
	...MARKET_EVENT_VALIDATORS,
	...AUDIT_EVENT_VALIDATORS,
	// as unknown as: Zod object built from runtime keys, shape not expressible statically
} as unknown as ZodEventMap<EventMap>;

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
