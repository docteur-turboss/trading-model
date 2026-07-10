import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { Message } from "@trading-model/common/contracts/message.types";
import type { Topic } from "@trading-model/common/domain/primitives";
import { logger } from "../../config/logger";
import { DeliveryErrorClassifier, DlqReason, ErrorActionType } from "./delivery-error-classifier";
import type { DeliveryParams } from "./delivery-params";
import type { MessageDeliveryPort } from "./message-delivery-port";

export interface DeliveryErrorHandlerDeps {
	deliveryPort: MessageDeliveryPort;
	recordFailure: () => void;
	topic: Topic;
	serviceName: ServiceInstanceName;
}

/**
 * Routes delivery errors based on classification from DeliveryErrorClassifier.
 */
export class DeliveryErrorHandler {
	private readonly _deliveryPort: MessageDeliveryPort;
	private readonly _recordFailure: () => void;
	private readonly _topic: Topic;
	private readonly _serviceName: ServiceInstanceName;
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
		deliveryParams: DeliveryParams
	): Promise<boolean> {
		const classification = this._classifier.classify(
			err,
			context.deliveryAttempt,
			deliveryParams
		);

		switch (classification.action) {
			case ErrorActionType.DLQ:
				if (classification.reason === DlqReason.MaxRetriesExceeded) {
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
			case ErrorActionType.SWALLOW:
				return true;
			case ErrorActionType.RETRY:
				return false;
			default:
				return false;
		}
	}
}
