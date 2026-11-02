import type { EventMap } from "@trading-model/contracts/event-map";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { ApiRouteHandler } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";

import { EVENT_MANAGER } from "../../application/services/event-manager-client";
import { MESSAGE_PAYLOAD_SCHEMA } from "../../shared/barrel/message.schema";
import type { BROKER_CALLBACK_API } from "./api-routes";

/**
 * Dispatches a delivered message to the listeners of its topic. The envelope
 * is parsed by the route (BROKER_CALLBACK_API); the payload schema depends on
 * the topic, so it is checked here.
 */
export const MESSAGE_CONTROLLER: ApiRouteHandler<
	(typeof BROKER_CALLBACK_API)["receive"]
> = async ({ body: { metadata, payload } }) => {
	const resultPayload = await MESSAGE_PAYLOAD_SCHEMA.safeParseAsync({
		type: metadata.topic,
		data: payload,
	});
	if (!resultPayload.success) {
		return sendResponse(
			{ error: "Invalid payload format" },
			HTTP_STATUS.BAD_REQUEST
		);
	}

	// The payload as received (not its parsed copy), checked just above.
	EVENT_MANAGER.emit(metadata.topic as keyof EventMap, payload as never);
	// Acknowledges the delivery: without a response message-manager waited for
	// its timeout, retried 10 times and gave up (circuit open, "routed to DLQ")
	// on every message, though the listeners had already received it.
	return sendResponse({ status: "delivered" }, HTTP_STATUS.OK);
};
