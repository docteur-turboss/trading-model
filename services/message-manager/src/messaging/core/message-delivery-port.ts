import type { Message } from "@trading-model/common/contracts/message.types";

export interface MessageDeliveryContext {
	deliveryAttempt: number;
	consumerGroup: string;
}

export interface MessageDeliveryPort {
	send(
		url: string,
		message: Message,
		context: MessageDeliveryContext
	): Promise<void>;
	markDeadLetter(
		message: Message,
		reason: string,
		deliveryAttempt: number
	): Promise<void>;
}
