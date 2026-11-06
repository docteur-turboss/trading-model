import {
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import { z } from "zod";
import { MESSAGE_METADATA_SCHEMA } from "../../shared/barrel/message.schema";

/**
 * The callback every subscriber of the broker mounts (ADR-0021, ADR-0043):
 * message-manager delivers each message of a subscribed topic to it.
 * Mounted by `MessageManagerListenExpress` at `MESSAGE_CALLBACK_PATH`
 * (`message` everywhere it is deployed).
 */
export const BROKER_CALLBACK_API = {
	receive: defineRoute({
		method: "POST",
		path: "/message",
		summary:
			"Receive a message delivered by message-manager; the payload is checked against the schema of its topic",
		body: z.object({
			metadata: MESSAGE_METADATA_SCHEMA,
			/** Absent for a void event (JSON drops an undefined payload). */
			payload: z.unknown().optional(),
			/** Delivery attempt (1 = first), set by message-manager. */
			context: z.object({ deliveryAttempt: z.number().int() }).optional(),
		}),
		responses: {
			/** Acknowledges the delivery: anything else but a 400 makes message-manager retry. */
			200: z.object({ status: z.literal("delivered") }),
			/** Payload refused by its topic schema: dead-lettered at once (REJECTED_BY_SUBSCRIBER). */
			400: ErrorResponse,
		},
	}),
} as const;
