import type { Message } from "@trading-model/common/contracts/message.types";
import type { SequenceNumber } from "@trading-model/common/domain/primitives";

export interface MessageDeliveryContext {
	deliveryAttempt: SequenceNumber;
	consumerGroup: string;
}

export interface DeliverySendInput {
	url: string;
	message: Message;
	context: MessageDeliveryContext;
}

export interface DeadLetterInput {
	message: Message;
	reason: string;
	deliveryAttempt: SequenceNumber;
}

export interface MessageDeliveryPort {
	send(input: DeliverySendInput): Promise<void>;
	markDeadLetter(input: DeadLetterInput): Promise<void>;
}
