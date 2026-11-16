import type { Message } from "@trading-model/contracts/message-types";

/** A message its subscriber group will not take any more (ADR-0073). */
export interface DeadLetterInput {
	service: string;
	/** Journal entry the delivery came from: acknowledged together with the copy. */
	entryId: string;
	message: Message;
	reason: string;
	deliveryAttempt: number;
}

/** Where dead-lettered messages go: the dead stream of the topic. */
export interface DeadLetterStorePort {
	insert(input: DeadLetterInput): Promise<void>;
}
