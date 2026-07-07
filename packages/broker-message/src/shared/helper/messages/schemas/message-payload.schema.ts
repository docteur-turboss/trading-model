import type { EventMap } from "@trading-model/common/config/event.types";
import { z } from "zod";

import { AUDIT_EVENT_VALIDATORS } from "./audit-event.schema";
import { CERTIFICATE_EVENT_VALIDATORS } from "./certificate-event.schema";
import { MARKET_EVENT_VALIDATORS } from "./market-event.schema";

type ZodEventMap<TObject extends object> = {
	[TKey in keyof TObject]: [TObject[TKey]] extends [undefined]
		? z.ZodVoid
		: z.ZodType<TObject[TKey]>;
};

export const EVENT_VALIDATORS = {
	...MARKET_EVENT_VALIDATORS,
	...AUDIT_EVENT_VALIDATORS,
	...CERTIFICATE_EVENT_VALIDATORS,
} as unknown as ZodEventMap<EventMap>;

export const MESSAGE_PAYLOAD_SCHEMA = z.discriminatedUnion(
	"type",
	Object.entries(EVENT_VALIDATORS).map(([type, schema]) =>
		z.object({
			type: z.literal(type),
			data: schema,
		})
	) as unknown as [z.ZodObject<z.ZodRawShape>, ...z.ZodObject<z.ZodRawShape>[]]
);

export type MessagePayload = z.infer<typeof MESSAGE_PAYLOAD_SCHEMA>;
