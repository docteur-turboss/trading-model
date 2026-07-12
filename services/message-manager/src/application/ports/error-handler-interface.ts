import type { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { SequenceNumber } from "@trading-model/common/domain/primitives";
import type { Message } from "@trading-model/validation/contracts/message.types";

export interface IErrorHandler<TInput = unknown, TOutput = unknown> {
	handle(input: TInput, ...args: unknown[]): Promise<TOutput> | TOutput;
}

export interface DeliveryErrorInput {
	err: unknown;
	message: Message;
	context: { deliveryAttempt: SequenceNumber };
	ttl: number;
	emittedAt: number;
	deliveryMode: DeliveryMode;
}

export interface WalErrorInput {
	raw: string[];
	consecutiveErrors: number;
}

export interface WalFlushErrorInput {
	raw: string[];
	consecutiveErrors: number;
	walKey: string;
}
