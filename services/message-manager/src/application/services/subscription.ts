import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { Message } from "@trading-model/contracts/message-types";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import {
	type SequenceNumber,
	type Topic,
	toServiceId,
} from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";
import { CircuitStateMachine } from "@trading-model/reliability/circuit-state-machine";
import {
	CIRCUIT_BREAKER_STATE,
	MESSAGES_DELIVERED_TOTAL,
	SUBSCRIBER_DELIVERY_CONCURRENCY,
} from "../../config/metrics";
import {
	classifyDeliveryError,
	ErrorActionType,
	isDeliveryExhausted,
} from "../../domain/delivery-error-classifier";
import { extractDeliveryParams } from "../../domain/delivery-metadata-extractor";
import type { MessageDeliveryPort } from "../../domain/ports/message-delivery.port";
import { resolveTarget } from "./address-resolver";

export interface SubscriptionConfig extends TopicBinding {
	deliveryPort: MessageDeliveryPort;
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
	private readonly _circuitBreaker = new CircuitStateMachine(
		CircuitStateMachine.defaultConfig()
	);
	private readonly _deliveryPort: MessageDeliveryPort;

	constructor(config: SubscriptionConfig) {
		this.topic = config.topic;
		this.callbackPath = config.callbackPath;
		this.serviceIdentity = config.serviceIdentity;
		this._deliveryPort = config.deliveryPort;
	}

	/** True while the breaker refuses sends: claiming pending entries would only burn their attempts. */
	isCircuitOpen(): boolean {
		return this._circuitBreaker.isOpen();
	}

	/**
	 * One delivery attempt, the `deliveries`-th of the message.
	 *
	 * @returns `true` when the entry is settled (delivered, dead-lettered or
	 *   dropped) and must be acknowledged, `false` to try again later (also
	 *   while the circuit is open: the entry waits in the journal).
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
		const circuitBreaker = this._circuitBreaker;
		const subscriber = this.serviceIdentity.serviceName;
		const count = (status: "success" | "failed") =>
			MESSAGES_DELIVERED_TOTAL.inc({ topic: this.topic, status });

		if (circuitBreaker.isOpen()) {
			CIRCUIT_BREAKER_STATE.set(
				{ subscriber },
				circuitStateIndex(CircuitState.OPEN)
			);
			getLogger().warn("Circuit breaker open: message left in the journal", {
				topic: this.topic,
				service: subscriber,
				failureCount: circuitBreaker.getFailureCount(),
			});
			return false;
		}

		const outcome = await this._attempt(message, deliveries);
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

	/**
	 * One attempt: `delivered` and `settled` (dead-lettered or dropped for
	 * good) are acknowledged, `retry` stays pending until its next attempt is due.
	 */
	private async _attempt<TData>(
		message: Message<TData>,
		deliveries: number
	): Promise<"delivered" | "settled" | "retry"> {
		const serviceName = this.serviceIdentity.serviceName as ServiceInstanceName;
		try {
			const target = await resolveTarget(
				toServiceId(serviceName),
				this.callbackPath
			);
			await this._deliveryPort.send({
				url: target,
				message,
				context: { deliveryAttempt: (deliveries - 1) as SequenceNumber },
			});
			return "delivered";
		} catch (err) {
			const deliveryAttempt = deliveries as SequenceNumber;
			const classification = classifyDeliveryError(
				err,
				deliveryAttempt,
				extractDeliveryParams(message)
			);
			if (classification.action !== ErrorActionType.DLQ) {
				return classification.action === ErrorActionType.SWALLOW
					? "settled"
					: "retry";
			}
			if (isDeliveryExhausted(classification.reason)) {
				this._circuitBreaker.recordFailure();
				getLogger().error("Delivery attempts exhausted, routing to DLQ", {
					topic: this.topic,
					service: serviceName,
					reason: classification.reason,
					deliveryAttempt,
				});
			}
			await this._deliveryPort.markDeadLetter({
				service: serviceName,
				message,
				reason: classification.reason,
				deliveryAttempt,
			});
			return "settled";
		}
	}
}
