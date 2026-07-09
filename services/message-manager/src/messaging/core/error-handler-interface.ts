import type { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { Message } from "@trading-model/common/contracts/message.types";

export interface IErrorHandler<TInput = unknown, TOutput = unknown> {
	handle(input: TInput, ...args: unknown[]): Promise<TOutput> | TOutput;
}

export interface DeliveryErrorInput {
	err: unknown;
	message: Message;
	context: { deliveryAttempt: number };
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
