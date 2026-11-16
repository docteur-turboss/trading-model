import { randomUUID } from "node:crypto";
import type {
	Message,
	MessageMetadata,
} from "@trading-model/contracts/message-types";
import {
	toMessageId,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { sanitizePayload } from "./payload-sanitizer";

export function createMessage(
	payload: unknown,
	metadata: Omit<MessageMetadata, "emittedAt" | "messageId">
): Message {
	return {
		metadata: {
			...metadata,
			emittedAt: UnixTimestamp.now(),
			messageId: toMessageId(randomUUID()),
		},
		payload: sanitizePayload(payload),
	};
}
