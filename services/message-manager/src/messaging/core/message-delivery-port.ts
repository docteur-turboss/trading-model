import type { Message } from "@trading-model/common/contracts/message.types";

export interface MessageDeliveryContext {
	deliveryAttempt: number;
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
	deliveryAttempt: number;
}

export interface MessageDeliveryPort {
	send(input: DeliverySendInput): Promise<void>;
	markDeadLetter(input: DeadLetterInput): Promise<void>;
}
