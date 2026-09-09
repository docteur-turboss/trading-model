/**
 * Express-compatible route handlers for the broker module (subscribe, unsubscribe, publish).
 * Uses Zod validation and ResponseException for standardized HTTP responses.
 */

import { toInstanceId, toTopic } from "@trading-model/common/domain/primitives";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { MessageMetadata } from "@trading-model/validation/domain/contracts/message.types";
import type { z } from "zod";
import type { Dispatcher } from "../core/dispatcher";
import {
	PUBLISH_SCHEMA,
	SUBSCRIBE_SCHEMA,
	UNSUBSCRIBE_SCHEMA,
} from "./validation/broker.schema";

/**
 * Parses the request body against the given Zod schema. On success returns the parsed
 * data; on failure returns the 400 {@link ResponseObject} the handler must return.
 */
function _parseBody<TData>(
	schema: z.ZodType,
	body: unknown
): TData | ReturnType<typeof sendResponse> {
	const parsed = schema.safeParse(body);
	if (!parsed.success) {
		return sendResponse({ error: parsed.error.message }, 400 as HttpStatusCode);
	}
	return parsed.data as TData;
}

/**
 * Validates subscription request and forwards to Dispatcher. Returns 204 on success.
 */
export const SUBSCRIPTION_TO_A_TOPIC = (dispatcher: Dispatcher) =>
	catchSync((req) => {
		const data = _parseBody<Parameters<Dispatcher["subscribe"]>[0]>(
			SUBSCRIBE_SCHEMA,
			req.body
		);
		if ("status" in data) {
			return data;
		}

		dispatcher.subscribe(data);

		return sendResponse(undefined, 204 as HttpStatusCode);
	});

/**
 * Validates unsubscription request and forwards to Dispatcher. Returns 204 on success.
 */
export const DELETE_A_SUBSCRIPTION = (dispatcher: Dispatcher) =>
	catchSync((req) => {
		const data = _parseBody<{
			topic: string;
			instanceId: string;
		}>(UNSUBSCRIBE_SCHEMA, req.body);
		if ("status" in data) {
			return data;
		}

		dispatcher.unsubscribe({
			topic: toTopic(data.topic),
			instanceId: toInstanceId(data.instanceId),
		});

		return sendResponse(undefined, 204 as HttpStatusCode);
	});

/**
 * Validates publish request and forwards payload + metadata to Dispatcher. Returns 204 on success.
 */
export const PUBLISH_A_MESSAGE = (dispatcher: Dispatcher) =>
	catchSync(async (req) => {
		const data = _parseBody<{
			payload: unknown;
			metadata: unknown;
		}>(PUBLISH_SCHEMA, req.body);
		if ("status" in data) {
			return data;
		}

		await dispatcher.publish(
			data.payload,
			data.metadata as Omit<MessageMetadata, "emittedAt" | "messageId">
		);

		return sendResponse(undefined, 204 as HttpStatusCode);
	});
