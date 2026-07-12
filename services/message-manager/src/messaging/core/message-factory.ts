import { randomUUID } from "node:crypto";
import { toMessageId } from "@trading-model/common/domain/primitives";
import type {
	Message,
	MessageMetadata,
} from "@trading-model/validation/contracts/message.types";
import { sanitizePayload } from "./payload-sanitizer";

export class MessageFactory {
	create(
		payload: unknown,
		metadata: Omit<MessageMetadata, "emittedAt" | "messageId">
	): Message {
		return {
			metadata: {
				...metadata,
				emittedAt: new Date(),
				messageId: toMessageId(randomUUID()),
			},
			payload: sanitizePayload(payload),
		};
	}
}
