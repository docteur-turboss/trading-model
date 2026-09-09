import type { EventMap } from "@trading-model/common/config/event.types";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { ResponseException } from "@trading-model/common/middleware/response-exception";

import { EVENT_MANAGER } from "../../application/services/event-manager-client";
import {
	MESSAGE_METADATA_SCHEMA,
	MESSAGE_PAYLOAD_SCHEMA,
} from "../../shared/barrel/message.schema";

/** Handles incoming broker messages and dispatches them to registered event listeners. */
export const MESSAGE_CONTROLLER = catchSync(async (req) => {
	const metadata = req.body.metadata;
	const payload = req.body.payload;

	const resultMetadata = await MESSAGE_METADATA_SCHEMA.safeParseAsync(metadata);
	if (!resultMetadata.success) {
		throw ResponseException(
			resultMetadata.error!.issues[0].message
		).badRequest();
	}

	const resultPayload = await MESSAGE_PAYLOAD_SCHEMA.safeParseAsync({
		type: resultMetadata.data.topic,
		data: payload,
	});

	if (!resultPayload.success) {
		throw ResponseException("Invalid payload format").badRequest();
	}

	EVENT_MANAGER.emit(resultMetadata.data.topic as keyof EventMap, payload);
});
