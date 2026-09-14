import { randomUUID } from "node:crypto";
import {
	toMessageId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type {
	Message,
	MessageMetadata,
} from "@trading-model/validation/domain/contracts/message.types";
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
