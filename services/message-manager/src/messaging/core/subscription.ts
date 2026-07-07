import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type {
	Message,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";
import { DeliveryAttemptHandler } from "./delivery-attempt-handler";
import { DeliveryCircuitBreaker } from "./delivery-circuit-breaker";
import { DeliveryErrorHandler } from "./delivery-error-handler";
import { DeliveryMetadataExtractor } from "./delivery-metadata-extractor";
import type { SubscribersContext } from "./delivery-metadata-extractor";
import type { MessageDeliveryPort } from "./message-delivery-port";
import { backoffDelay as computeBackoffDelay } from "./backoff-calculator";

export interface SubscriptionConfig {
	topic: string;
	callbackURL: string;
	serviceIdentity: ServiceIdentity;
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
	readonly topic: string;
	readonly callbackURL: string;
	readonly serviceIdentity: ServiceIdentity;
	private _deliveryPort: MessageDeliveryPort;
	private _circuitBreaker: DeliveryCircuitBreaker;
	private _errorHandler: DeliveryErrorHandler;
	private _metadataExtractor: DeliveryMetadataExtractor;
	private _attemptHandler: DeliveryAttemptHandler;

	static backoffDelay(deliveryAttempt: number): number {
		return computeBackoffDelay(deliveryAttempt);
	}

	constructor(config: SubscriptionConfig) {
		this.topic = config.topic;
		this.callbackURL = config.callbackURL;
		this.serviceIdentity = config.serviceIdentity;
		this._deliveryPort = config.deliveryPort;
		this._circuitBreaker = this._createCircuitBreaker(config);
		this._errorHandler = this._createErrorHandler(config);
		this._metadataExtractor = new DeliveryMetadataExtractor();
		this._attemptHandler = this._createAttemptHandler(config);
	}

	private _createCircuitBreaker(config: SubscriptionConfig): DeliveryCircuitBreaker {
		return new DeliveryCircuitBreaker(
			config.topic,
			config.serviceIdentity.serviceName
		);
	}

	private _createAttemptHandler(config: SubscriptionConfig): DeliveryAttemptHandler {
		return new DeliveryAttemptHandler(
			config.deliveryPort,
			this._errorHandler,
			config.callbackURL,
			config.serviceIdentity.serviceName
		);
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
		const { ttl, deliveryMode, emittedAt } =
			this._metadataExtractor.extract(message);

		if (await this._circuitBreaker.checkDelivery(message, this._deliveryPort)) {
			return;
		}

		const { context, isAcknowledged } = this._buildSubscriberContext();
		await this._deliverUntilAcknowledged(
			message, context, ttl, emittedAt, deliveryMode, isAcknowledged
		);
		this._circuitBreaker.clear();
	}

	private _buildSubscriberContext(): {
		context: SubscribersContext;
		isAcknowledged: () => boolean;
	} {
		let acknowledged = false;
		const context = this._metadataExtractor.buildSubscriberContext(
			this.serviceIdentity.serviceName,
			() => { acknowledged = true; }
		);
		return { context, isAcknowledged: () => acknowledged };
	}

	private async _deliverUntilAcknowledged<TData>(
		message: Message<TData>,
		context: SubscribersContext,
		ttl: number,
		emittedAt: number,
		deliveryMode: DeliveryMode,
		isAcknowledged: () => boolean
	): Promise<void> {
		while (!isAcknowledged()) {
			const shouldRetry = await this._attemptHandler.attempt(
				message, context, ttl, emittedAt, deliveryMode
			);
			if (!shouldRetry) {
				return;
			}
		}
	}
}
