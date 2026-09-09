import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type {
	SequenceNumber,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import type { Message } from "@trading-model/validation/domain/contracts/message.types";
import { logger } from "../../config/logger";
import type { DeliveryAttemptHandler } from "./delivery-attempt-handler";
import type { DeliveryErrorHandler } from "./delivery-error-handler";
import type { SubscribersContext } from "./delivery-metadata-extractor";
import {
	buildSubscriberContext,
	extractDeliveryParams,
} from "./delivery-metadata-extractor";
import type { DeliveryParams } from "./delivery-params";
import type { MessageDeliveryPort } from "./message-delivery-port";

export interface DispatchContext {
	topic: Topic;
	serviceName: ServiceInstanceName;
}

export interface DispatchServices {
	circuitBreaker: CircuitStateMachine;
	attemptHandler: DeliveryAttemptHandler;
	errorHandler: DeliveryErrorHandler;
	deliveryPort: MessageDeliveryPort;
}

export async function dispatchToSubscriber<TData>(
	message: Message<TData>,
	context: DispatchContext,
	services: DispatchServices
): Promise<void> {
	const deliveryParams = extractDeliveryParams(message);

	if (services.circuitBreaker.isOpen()) {
		logger.warn("Circuit breaker open and rejecting dispatch", {
			topic: context.topic,
			service: context.serviceName,
			failureCount: services.circuitBreaker.getFailureCount(),
		});
		await services.deliveryPort.markDeadLetter({
			message,
			reason: CircuitState.OPEN.toUpperCase(),
			deliveryAttempt:
				services.circuitBreaker.getFailureCount() as SequenceNumber,
		});
		return;
	}

	const { subscriberContext, isAcknowledged } = buildDispatchSubscriberContext(
		context.serviceName
	);
	await deliverUntilAcknowledged(
		message,
		subscriberContext,
		deliveryParams,
		services.attemptHandler,
		isAcknowledged
	);
	if (isAcknowledged()) {
		services.circuitBreaker.clear();
	}
}

function buildDispatchSubscriberContext(serviceName: ServiceInstanceName): {
	subscriberContext: SubscribersContext;
	isAcknowledged: () => boolean;
} {
	let acknowledged = false;
	const subscriberContext = buildSubscriberContext(serviceName, () => {
		acknowledged = true;
	});
	return { subscriberContext, isAcknowledged: () => acknowledged };
}

async function deliverUntilAcknowledged<TData>(
	message: Message<TData>,
	subscriberContext: SubscribersContext,
	deliveryParams: DeliveryParams,
	attemptHandler: DeliveryAttemptHandler,
	isAcknowledged: () => boolean
): Promise<void> {
	while (!isAcknowledged()) {
		const shouldRetry = await attemptHandler.attempt(
			message,
			subscriberContext,
			deliveryParams
		);
		if (!shouldRetry) {
			return;
		}
	}
}
