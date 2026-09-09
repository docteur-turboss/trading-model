import type {
	ConsumerGroupName,
	SequenceNumber,
	URLString,
} from "@trading-model/common/domain/primitives";
import type { Message } from "@trading-model/validation/domain/contracts/message.types";

export interface MessageDeliveryContext {
	deliveryAttempt: SequenceNumber;
	consumerGroup: ConsumerGroupName;
}

export interface DeliverySendInput {
	url: URLString;
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
