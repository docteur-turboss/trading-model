import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	SequenceNumber,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { Message } from "@trading-model/validation/domain/contracts/message.types";
import { logger } from "../../config/logger";
import {
	DeliveryErrorClassifier,
	DlqReason,
	ErrorActionType,
} from "./delivery-error-classifier";
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
	handleDeliveryError<TData>(
		err: unknown,
		message: Message<TData>,
		context: { deliveryAttempt: SequenceNumber },
		deliveryParams: DeliveryParams
	): Promise<boolean> {
		const classification = this._classifier.classify(
			err,
			context.deliveryAttempt,
			deliveryParams
		);

		return this._actionHandlers[classification.action](
			message,
			context,
			classification
		);
	}

	private readonly _actionHandlers: Record<
		ErrorActionType,
		<TData>(
			message: Message<TData>,
			context: { deliveryAttempt: SequenceNumber },
			classification: ReturnType<DeliveryErrorClassifier["classify"]>
		) => Promise<boolean>
	> = {
		[ErrorActionType.DLQ]: async (message, context, classification) => {
			if (classification.action === ErrorActionType.DLQ) {
				if (classification.reason === DlqReason.MaxRetriesExceeded) {
					this._recordFailure();
					logger.error("Max retries exceeded and routing to DLQ", {
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
			}
			return true;
		},
		[ErrorActionType.SWALLOW]: async () => true,
		[ErrorActionType.RETRY]: async () => false,
	};
}
