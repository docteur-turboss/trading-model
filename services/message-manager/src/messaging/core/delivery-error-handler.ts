import type { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type { Message } from "@trading-model/common/contracts/message.types";
import { logger } from "../../config/logger";
import { DeliveryErrorClassifier } from "./delivery-error-classifier";
import type { MessageDeliveryPort } from "./message-delivery-port";

export interface DeliveryErrorHandlerDeps {
	deliveryPort: MessageDeliveryPort;
	recordFailure: () => void;
	topic: string;
	serviceName: string;
}

/**
 * Routes delivery errors based on classification from DeliveryErrorClassifier.
 */
export class DeliveryErrorHandler {
	private readonly _deliveryPort: MessageDeliveryPort;
	private readonly _recordFailure: () => void;
	private readonly _topic: string;
	private readonly _serviceName: string;
	private readonly _classifier: DeliveryErrorClassifier;

	constructor(deps: DeliveryErrorHandlerDeps) {
		this._deliveryPort = deps.deliveryPort;
		this._recordFailure = deps.recordFailure;
		this._topic = deps.topic;
		this._serviceName = deps.serviceName;
		this._classifier = new DeliveryErrorClassifier();
	}

	/**
	 * Classifies the error and routes accordingly.
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
		const classification = this._classifier.classify(
			err,
			context.deliveryAttempt,
			ttl,
			emittedAt,
			deliveryMode
		);

		switch (classification.action) {
			case "dlq":
				if (classification.reason === "MAX_RETRIES_EXCEEDED") {
					this._recordFailure();
					logger.error("Max retries exceeded — routing to DLQ", {
						topic: this._topic,
						service: this._serviceName,
						deliveryAttempt: context.deliveryAttempt,
					});
				}
				await this._deliveryPort.markDeadLetter({
					message,
					reason: classification.reason,
					deliveryAttempt: context.deliveryAttempt,
				});
				return true;
			case "swallow":
				return true;
			case "retry":
				return false;
			default:
				return false;
		}
	}
}
