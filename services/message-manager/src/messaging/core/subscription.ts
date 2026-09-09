import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	SequenceNumber,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { TopicBinding } from "@trading-model/common/domain/topic-binding";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import type { Message } from "@trading-model/validation/domain/contracts/message.types";
import { backoffDelay as computeBackoffDelay } from "./backoff-calculator";
import { DeliveryAttemptHandler } from "./delivery-attempt-handler";
import { DeliveryErrorHandler } from "./delivery-error-handler";
import {
	type DispatchServices,
	dispatchToSubscriber,
} from "./dispatch-orchestrator";
import type { MessageDeliveryPort } from "./message-delivery-port";

export interface SubscriptionConfig extends TopicBinding {
	deliveryPort: MessageDeliveryPort;
}

export function buildDispatchServices(
	config: SubscriptionConfig
): DispatchServices {
	const circuitBreaker = new CircuitStateMachine(
		CircuitStateMachine.defaultConfig()
	);
	const errorHandler = new DeliveryErrorHandler({
		deliveryPort: config.deliveryPort,
		recordFailure: () => circuitBreaker.recordFailure(),
		topic: config.topic,
		serviceName: config.serviceIdentity.serviceName as ServiceInstanceName,
	});
	const attemptHandler = new DeliveryAttemptHandler({
		deliveryPort: config.deliveryPort,
		errorHandler,
		callbackPath: config.callbackPath,
		serviceName: config.serviceIdentity.serviceName as ServiceInstanceName,
	});
	return {
		circuitBreaker,
		attemptHandler,
		errorHandler,
		deliveryPort: config.deliveryPort,
	};
}

export class Subscription {
	readonly topic: Topic;
	readonly callbackPath: string;
	readonly serviceIdentity: ServiceIdentity;
	private readonly _services: DispatchServices;

	static backoffDelay(deliveryAttempt: SequenceNumber): number {
		return computeBackoffDelay(deliveryAttempt);
	}

	constructor(config: SubscriptionConfig) {
		this.topic = config.topic;
		this.callbackPath = config.callbackPath;
		this.serviceIdentity = config.serviceIdentity;
		this._services = buildDispatchServices(config);
	}

	async dispatch<TData>(message: Message<TData>): Promise<void> {
		await dispatchToSubscriber(
			message,
			{
				topic: this.topic,
				serviceName: this.serviceIdentity.serviceName as ServiceInstanceName,
			},
			this._services
		);
	}
}
