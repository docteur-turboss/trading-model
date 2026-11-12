import type { EventMap } from "@trading-model/contracts/event-map";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { ApiRouteHandler } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";

import { EVENT_MANAGER } from "../../application/services/event-manager-client";
import { MESSAGE_PAYLOAD_SCHEMA } from "../../shared/barrel/message.schema";
import type { BROKER_CALLBACK_API } from "./api-routes";

/** Delivered `messageId`s remembered per process: bounds the memory of the dedup. */
export const DELIVERED_IDS_MAX = 10_000;

// A Set iterates in insertion order: the first entry is the oldest.
// shortcut: per process, lost on restart and not shared between replicas; a shared store when a consumer has side effects.
const deliveredIds = new Set<string>();

/**
 * Dispatches a delivered message to the listeners of its topic. The envelope
 * is parsed by the route (BROKER_CALLBACK_API); the payload schema depends on
 * the topic, so it is checked here. The bus delivers at least once: a
 * `messageId` already emitted is acknowledged without being emitted again.
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

	const { messageId } = metadata;
	if (messageId && deliveredIds.has(messageId)) {
		getLogger().debug("Duplicate delivery skipped", {
			messageId,
			topic: metadata.topic,
		});
		return sendResponse({ status: "delivered" }, HTTP_STATUS.OK);
	}
	if (messageId) {
		deliveredIds.add(messageId);
		if (deliveredIds.size > DELIVERED_IDS_MAX) {
			deliveredIds.delete(deliveredIds.values().next().value as string);
		}
	}

	// The payload as received (not its parsed copy), checked just above.
	EVENT_MANAGER.emit(metadata.topic as keyof EventMap, payload as never);
	// Acknowledges the delivery: without a response message-manager waited for
	// its timeout, retried 10 times and gave up (circuit open, "routed to DLQ")
	// on every message, though the listeners had already received it.
	return sendResponse({ status: "delivered" }, HTTP_STATUS.OK);
};
