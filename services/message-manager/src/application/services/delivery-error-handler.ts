import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { Message } from "@trading-model/contracts/message-types";
import type {
	SequenceNumber,
	Topic,
} from "@trading-model/primitives/primitives";
import {
	classifyDeliveryError,
	ErrorActionType,
	isDeliveryExhausted,
} from "../../domain/delivery-error-classifier";
import type { DeliveryParams } from "../../domain/delivery-params";
import type { MessageDeliveryPort } from "../../domain/ports/message-delivery.port";

export interface DeliveryErrorHandlerDeps {
	deliveryPort: MessageDeliveryPort;
	recordFailure: () => void;
	topic: Topic;
	serviceName: ServiceInstanceName;
}

/**
 * Routes delivery errors based on classification from classifyDeliveryError.
 */
export class DeliveryErrorHandler {
	private readonly _deliveryPort: MessageDeliveryPort;
	private readonly _recordFailure: () => void;
	private readonly _topic: Topic;
	private readonly _serviceName: ServiceInstanceName;

	constructor(deps: DeliveryErrorHandlerDeps) {
		this._deliveryPort = deps.deliveryPort;
		this._recordFailure = deps.recordFailure;
		this._topic = deps.topic;
		this._serviceName = deps.serviceName;
	}

	/**
	 * Classifies the error and routes accordingly.
	 *
	 * @returns `true` when the error has been fully handled (no retry needed).
	 */
	async handleDeliveryError<TData>(
		err: unknown,
		message: Message<TData>,
		context: { deliveryAttempt: SequenceNumber },
		deliveryParams: DeliveryParams
	): Promise<boolean> {
		const classification = classifyDeliveryError(
			err,
			context.deliveryAttempt,
			deliveryParams
		);
		if (classification.action !== ErrorActionType.DLQ) {
			return classification.action === ErrorActionType.SWALLOW;
		}
		if (isDeliveryExhausted(classification.reason)) {
			this._recordFailure();
			getLogger().error("Delivery attempts exhausted, routing to DLQ", {
				topic: this._topic,
				service: this._serviceName,
				reason: classification.reason,
				deliveryAttempt: context.deliveryAttempt,
			});
		}
		await this._deliveryPort.markDeadLetter({
			service: this._serviceName,
			message,
			reason: classification.reason,
			deliveryAttempt: context.deliveryAttempt,
		});
		return true;
	}
}
