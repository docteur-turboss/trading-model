import { CircuitState } from "@trading-model/common/domain/circuit-state";
import type {
	SequenceNumber,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { TopicBinding } from "@trading-model/common/domain/topic-binding";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import type { Message } from "@trading-model/validation/contracts/message.types";
import { logger } from "../../config/logger";
import { backoffDelay as computeBackoffDelay } from "./backoff-calculator";
import { DeliveryAttemptHandler } from "./delivery-attempt-handler";
import { DeliveryErrorHandler } from "./delivery-error-handler";
import type { SubscribersContext } from "./delivery-metadata-extractor";
import {
	buildSubscriberContext,
	extractDeliveryParams,
} from "./delivery-metadata-extractor";
import type { DeliveryParams } from "./delivery-params";
import type { MessageDeliveryPort } from "./message-delivery-port";

export interface SubscriptionConfig extends TopicBinding {
	deliveryPort: MessageDeliveryPort;
}

/**
 * Represents a subscription binding between a topic and a service endpoint.
 *
 * @description
 * Manages delivery of messages for a given topic to a specific subscriber.
 * Enforces delivery semantics and TTL expiration, and routes failures to DLQ.
 *
 * @class Subscription
 */
export class Subscription {
	readonly topic: Topic;
	readonly callbackPath: string;
	readonly serviceIdentity: ServiceIdentity;
	private _deliveryPort: MessageDeliveryPort;
	private _circuitBreaker: CircuitStateMachine;
	private _errorHandler: DeliveryErrorHandler;
	private _attemptHandler: DeliveryAttemptHandler;

	static backoffDelay(deliveryAttempt: SequenceNumber): number {
		return computeBackoffDelay(deliveryAttempt);
	}

	constructor(config: SubscriptionConfig) {
		this.topic = config.topic;
		this.callbackPath = config.callbackPath;
		this.serviceIdentity = config.serviceIdentity;
		this._deliveryPort = config.deliveryPort;
		this._circuitBreaker = this._createCircuitBreaker(config);
		this._errorHandler = this._createErrorHandler(config);
		this._attemptHandler = this._createAttemptHandler(config);
	}

	private _createCircuitBreaker(
		_config: SubscriptionConfig
	): CircuitStateMachine {
		return new CircuitStateMachine(CircuitStateMachine.defaultConfig());
	}

	private _createAttemptHandler(
		config: SubscriptionConfig
	): DeliveryAttemptHandler {
		return new DeliveryAttemptHandler({
			deliveryPort: config.deliveryPort,
			errorHandler: this._errorHandler,
			callbackPath: config.callbackPath,
			serviceName: config.serviceIdentity.serviceName,
		});
	}

	private _createErrorHandler(
		config: SubscriptionConfig
	): DeliveryErrorHandler {
		return new DeliveryErrorHandler({
			deliveryPort: config.deliveryPort,
			recordFailure: () => this._circuitBreaker.recordFailure(),
			topic: config.topic,
			serviceName: config.serviceIdentity.serviceName,
		});
	}

	async dispatch<TData>(message: Message<TData>): Promise<void> {
		const deliveryParams = extractDeliveryParams(message);

		if (this._circuitBreaker.isOpen()) {
			logger.warn("Circuit breaker open and rejecting dispatch", {
				topic: this.topic,
				service: this.serviceIdentity.serviceName,
				failureCount: this._circuitBreaker.getFailureCount(),
			});
			await this._deliveryPort.markDeadLetter({
				message,
				reason: CircuitState.OPEN.toUpperCase(),
				deliveryAttempt:
					this._circuitBreaker.getFailureCount() as SequenceNumber,
			});
			return;
		}

		const { context, isAcknowledged } = this._buildSubscriberContext();
		await this._deliverUntilAcknowledged(
			message,
			context,
			deliveryParams,
			isAcknowledged
		);
		if (isAcknowledged()) {
			this._circuitBreaker.clear();
		}
	}

	private _buildSubscriberContext(): {
		context: SubscribersContext;
		isAcknowledged: () => boolean;
	} {
		let acknowledged = false;
		const context = buildSubscriberContext(
			this.serviceIdentity.serviceName,
			() => {
				acknowledged = true;
			}
		);
		return { context, isAcknowledged: () => acknowledged };
	}

	private async _deliverUntilAcknowledged<TData>(
		message: Message<TData>,
		context: SubscribersContext,
		deliveryParams: DeliveryParams,
		isAcknowledged: () => boolean
	): Promise<void> {
		while (!isAcknowledged()) {
			const shouldRetry = await this._attemptHandler.attempt(
				message,
				context,
				deliveryParams
			);
			if (!shouldRetry) {
				return;
			}
		}
	}
}
