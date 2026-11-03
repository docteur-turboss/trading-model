import type { Message } from "@trading-model/contracts/message-types";
import type {
	SequenceNumber,
	URLString,
} from "@trading-model/primitives/primitives";

interface MessageDeliveryContext {
	deliveryAttempt: SequenceNumber;
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
