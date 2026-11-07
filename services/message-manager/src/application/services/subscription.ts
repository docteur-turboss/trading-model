import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { Message } from "@trading-model/contracts/message-types";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import type {
	SequenceNumber,
	Topic,
} from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";
import { CircuitStateMachine } from "@trading-model/reliability/circuit-state-machine";
import {
	CIRCUIT_BREAKER_STATE,
	MESSAGES_DELIVERED_TOTAL,
	SUBSCRIBER_DELIVERY_CONCURRENCY,
} from "../../config/metrics";
import { extractDeliveryParams } from "../../domain/delivery-metadata-extractor";
import type { MessageDeliveryPort } from "../ports/message-delivery-port";
import { DeliveryAttemptHandler } from "./delivery-attempt-handler";
import { DeliveryErrorHandler } from "./delivery-error-handler";

export interface SubscriptionConfig extends TopicBinding {
	deliveryPort: MessageDeliveryPort;
}

interface DeliveryServices {
	circuitBreaker: CircuitStateMachine;
	attemptHandler: DeliveryAttemptHandler;
	deliveryPort: MessageDeliveryPort;
}

function buildDeliveryServices(config: SubscriptionConfig): DeliveryServices {
	const serviceName = config.serviceIdentity.serviceName as ServiceInstanceName;
	const circuitBreaker = new CircuitStateMachine(
		CircuitStateMachine.defaultConfig()
	);
	const errorHandler = new DeliveryErrorHandler({
		deliveryPort: config.deliveryPort,
		recordFailure: () => circuitBreaker.recordFailure(),
		topic: config.topic,
		serviceName,
	});
	const attemptHandler = new DeliveryAttemptHandler({
		deliveryPort: config.deliveryPort,
		errorHandler,
		callbackPath: config.callbackPath,
		serviceName,
	});
	return { circuitBreaker, attemptHandler, deliveryPort: config.deliveryPort };
}

function circuitStateIndex(state: CircuitState): number {
	return Object.values(CircuitState).indexOf(state);
}

/**
 * Delivery state of one subscriber service for one topic (circuit breaker,
 * kept per replica). Delivers one journal entry per call.
 */
export class Subscription {
	readonly topic: Topic;
	readonly callbackPath: string;
	readonly serviceIdentity: ServiceIdentity;
	private readonly _services: DeliveryServices;

	constructor(config: SubscriptionConfig) {
		this.topic = config.topic;
		this.callbackPath = config.callbackPath;
		this.serviceIdentity = config.serviceIdentity;
		this._services = buildDeliveryServices(config);
	}

	/**
	 * One delivery attempt, the `deliveries`-th of the message.
	 *
	 * @returns `true` when the entry is settled (delivered, dead-lettered or
	 *   dropped) and must be acknowledged, `false` to try again later.
	 */
	async deliver<TData>(
		message: Message<TData>,
		deliveries: number
	): Promise<boolean> {
		const subscriber = this.serviceIdentity.serviceName;
		SUBSCRIBER_DELIVERY_CONCURRENCY.inc({ subscriber });
		try {
			return await this._deliver(message, deliveries);
		} finally {
			SUBSCRIBER_DELIVERY_CONCURRENCY.dec({ subscriber });
		}
	}

	private async _deliver<TData>(
		message: Message<TData>,
		deliveries: number
	): Promise<boolean> {
		const { circuitBreaker, attemptHandler, deliveryPort } = this._services;
		const subscriber = this.serviceIdentity.serviceName;
		const count = (status: "success" | "failed") =>
			MESSAGES_DELIVERED_TOTAL.inc({ topic: this.topic, status });

		if (circuitBreaker.isOpen()) {
			CIRCUIT_BREAKER_STATE.set(
				{ subscriber },
				circuitStateIndex(CircuitState.OPEN)
			);
			count("failed");
			getLogger().warn("Circuit breaker open and rejecting dispatch", {
				topic: this.topic,
				service: subscriber,
				failureCount: circuitBreaker.getFailureCount(),
			});
			await deliveryPort.markDeadLetter({
				message,
				reason: CircuitState.OPEN.toUpperCase(),
				deliveryAttempt: circuitBreaker.getFailureCount() as SequenceNumber,
			});
			return true;
		}

		const outcome = await attemptHandler.attempt(
			message,
			deliveries,
			extractDeliveryParams(message)
		);
		if (outcome === "delivered") {
			count("success");
			circuitBreaker.clear();
			CIRCUIT_BREAKER_STATE.set(
				{ subscriber },
				circuitStateIndex(CircuitState.CLOSED)
			);
		} else if (outcome === "settled") {
			count("failed");
		}
		return outcome !== "retry";
	}
}
