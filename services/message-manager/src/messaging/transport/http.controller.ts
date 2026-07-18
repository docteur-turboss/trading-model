/**
 * Express-compatible route handlers for the broker module (subscribe, unsubscribe, publish).
 * Uses Zod validation and ResponseException for standardized HTTP responses.
 */

import { toInstanceId, toTopic } from "@trading-model/common/domain/primitives";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { MessageMetadata } from "@trading-model/validation/contracts/message.types";
import type { Dispatcher } from "../core/dispatcher";
import {
	PUBLISH_SCHEMA,
	SUBSCRIBE_SCHEMA,
	UNSUBSCRIBE_SCHEMA,
} from "./validation/broker.schema";

/**
 * Validates subscription request and forwards to Dispatcher. Returns 204 on success.
 */
export const SUBSCRIPTION_TO_A_TOPIC = (dispatcher: Dispatcher) =>
	catchSync((req) => {
		const parsed = SUBSCRIBE_SCHEMA.safeParse(req.body);

		if (!parsed.success) {
			return sendResponse(
				{ error: parsed.error.message },
				400 as HttpStatusCode
			);
		}

		dispatcher.subscribe(parsed.data);

		return sendResponse(undefined, 204 as HttpStatusCode);
	});

/**
 * Validates unsubscription request and forwards to Dispatcher. Returns 204 on success.
 */
export const DELETE_A_SUBSCRIPTION = (dispatcher: Dispatcher) =>
	catchSync((req) => {
		const parsed = UNSUBSCRIBE_SCHEMA.safeParse(req.body);

		if (!parsed.success) {
			return sendResponse(
				{ error: parsed.error.message },
				400 as HttpStatusCode
			);
		}

		dispatcher.unsubscribe({
			topic: toTopic(parsed.data.topic),
			instanceId: toInstanceId(parsed.data.instanceId),
		});

		return sendResponse(undefined, 204 as HttpStatusCode);
	});

/**
 * Validates publish request and forwards payload + metadata to Dispatcher. Returns 204 on success.
 */
export const PUBLISH_A_MESSAGE = (dispatcher: Dispatcher) =>
	catchSync(async (req) => {
		const parsed = PUBLISH_SCHEMA.safeParse(req.body);

		if (!parsed.success) {
			return sendResponse(
				{ error: parsed.error.message },
				400 as HttpStatusCode
			);
		}

		await dispatcher.publish(
			parsed.data.payload,
			parsed.data.metadata as Omit<MessageMetadata, "emittedAt" | "messageId">
		);

		return sendResponse(undefined, 204 as HttpStatusCode);
	});
