import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { Message } from "@trading-model/common/contracts/message.types";
import { AppError, DeadLetterError } from "@trading-model/common/utils/errors";
import type { MessageDeliveryPort } from "./message-delivery-port";
import { logger } from "../../config/logger";

/** Maximum number of delivery retries before routing to DLQ. */
const MAX_RETRIES = 10;

export interface DeliveryErrorHandlerDeps {
	deliveryPort: MessageDeliveryPort;
	recordFailure: () => void;
	topic: string;
	serviceName: string;
}

/**
 * Classifies delivery errors and decides whether to DLQ, retry, or
 * silently swallow the message based on delivery mode and TTL.
 */
export class DeliveryErrorHandler {
	private readonly _deliveryPort: MessageDeliveryPort;
	private readonly _recordFailure: () => void;
	private readonly _topic: string;
	private readonly _serviceName: string;

	constructor(deps: DeliveryErrorHandlerDeps) {
		this._deliveryPort = deps.deliveryPort;
		this._recordFailure = deps.recordFailure;
		this._topic = deps.topic;
		this._serviceName = deps.serviceName;
	}

	/**
	 * Examines a delivery error and takes the appropriate action:
	 * - **DEAD_LETTER_ERROR** – routes to DLQ immediately with the error reason.
	 * - **TTL expired** – routes to DLQ with `TTL_EXPIRED`.
	 * - **AT_MOST_ONCE** – silently swallows the error.
	 * - **Max retries exceeded** – increments failure count and routes to DLQ.
	 *
	 * @returns `true` when the error has been fully handled (no retry needed).
	 */
	async handleDeliveryError<TData>(
		err: unknown,
		message: Message<TData>,
		context: { deliveryAttempt: number },
		ttl: number,
		emittedAt: number,
		deliveryMode: DeliveryMode
	): Promise<boolean> {
		if (err instanceof DeadLetterError) {
			const reason: string = err.reason ?? "NO_REASON";
			await this._deliveryPort.markDeadLetter(
				message,
				reason,
				context.deliveryAttempt
			);
			return true;
		}

		if (this._isExpired(ttl, emittedAt)) {
			await this._deliveryPort.markDeadLetter(
				message,
				"TTL_EXPIRED",
				context.deliveryAttempt
			);
			return true;
		}

		if (deliveryMode === DeliveryMode.AT_MOST_ONCE) {
			return true;
		}

		if (context.deliveryAttempt >= MAX_RETRIES) {
			this._recordFailure();
			logger.error("Max retries exceeded — routing to DLQ", {
				topic: this._topic,
				service: this._serviceName,
				deliveryAttempt: context.deliveryAttempt,
			});
			await this._deliveryPort.markDeadLetter(
				message,
				"MAX_RETRIES_EXCEEDED",
				context.deliveryAttempt
			);
			return true;
		}

		return false;
	}

	/**
	 * Determines if a message has exceeded its TTL.
	 */
	private _isExpired(ttl: number, emittedAt: number): boolean {
		if (ttl <= 0 || emittedAt <= 0) {
			return false;
		}
		return emittedAt + ttl < Date.now();
	}
}
