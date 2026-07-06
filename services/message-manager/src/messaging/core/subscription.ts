/**
 * @file subscription.ts
 *
 * @description
 * Implements the subscriber-side delivery mechanism of the message broker.
 * Handles dispatching messages to subscribed services via HTTP callbacks
 * with support for delivery semantics, retries, TTL expiration, and DLQ routing.
 *
 * @responsability
 * - Dispatch messages to service endpoints subscribed to a topic
 * - Enforce delivery semantics (AT_LEAST_ONCE / AT_MOST_ONCE)
 * - Handle acknowledgements, retries, and TTL expiration
 * - Route failed messages to a Dead Letter Queue (DLQ)
 *
 * @restrictions
 * - This module acts as a delivery orchestrator and does not process business logic
 * - Message payloads must not be mutated
 * - Messages cannot be persisted or exposed outside delivery context
 *
 * @architecture
 * Infrastructure / messaging layer component.
 * Acts as a delivery orchestrator for the Broker service.
 */
import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type {
	Message,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";
import { sleep } from "@trading-model/common/utils/sleep";
import { FIND_A_SERVICE } from "../../config/address-manager";
import { DeliveryCircuitBreaker } from "./delivery-circuit-breaker";
import { DeliveryErrorHandler } from "./delivery-error-handler";
import type {
	DeliverySendInput,
	MessageDeliveryContext,
	MessageDeliveryPort,
} from "./message-delivery-port";

/** Base delay (ms) for exponential backoff between retries. */
const BaseDelayMs = 1000;

/** Maximum delay (ms) cap for exponential backoff. */
const MaxDelayMs = 60_000;

/** Random jitter factor applied to backoff delay (±20%). */
const JitterFactor = 0.2;

/**
 * Runtime context provided to subscribers during message delivery.
 *
 * @description
 * Exposes delivery metadata and acknowledgement controls to the subscriber,
 * allowing explicit signaling of successful or failed processing.
 *
 * @interface SubscribersContext
 */
interface SubscribersContext {
	/** Timestamp when the message was successfully delivered; null until acked */
	receivedAt: Date | null;

	/** Logical consumer group identifier used for load balancing and retries */
	consumerGroup: string;

	/** Number of delivery attempts performed */
	deliveryAttempt: number;

	/**
	 * Acknowledges successful message processing
	 *
	 * @returns {Promise<void>}
	 */
	ack(): Promise<void>;
}

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

	/**
	 * Computes exponential backoff delay with jitter for retry.
	 *
	 * @param deliveryAttempt - Current attempt number (0-based).
	 * @returns Delay in milliseconds.
	 */
	static backoffDelay(deliveryAttempt: number): number {
		const delay = computeExponentialBackoff(deliveryAttempt, { baseDelayMs: BaseDelayMs, maxDelayMs: MaxDelayMs });
		const jitter = delay * JitterFactor * (Math.random() * 2 - 1);
		return Math.max(0, Math.round(delay + jitter));
	}

	constructor(config: SubscriptionConfig) {
		this.topic = config.topic;
		this.callbackURL = config.callbackURL;
		this.serviceIdentity = config.serviceIdentity;
		this._deliveryPort = config.deliveryPort;
		this._circuitBreaker = new DeliveryCircuitBreaker(
			config.topic,
			config.serviceIdentity.serviceName
		);
		this._errorHandler = this._createErrorHandler(config);
	}

	private _createErrorHandler(config: SubscriptionConfig): DeliveryErrorHandler {
		return new DeliveryErrorHandler({
			deliveryPort: config.deliveryPort,
			recordFailure: () => this._circuitBreaker.recordFailure(),
			topic: config.topic,
			serviceName: config.serviceIdentity.serviceName,
		});
	}

	/**
	 * Dispatches a message to the subscribed service.
	 *
	 * Resolves the target service address, sends the message via HTTP,
	 * retries with exponential backoff up to MAX_RETRIES, and falls
	 * back to the Dead Letter Queue when all retries are exhausted.
	 * A circuit breaker prevents cascading failures when the target
	 * service is persistently unavailable.
	 *
	 * Delivery behavior depends on `DeliveryMode`:
	 * - `AT_LEAST_ONCE`: retries until ACK, max retries, or TTL expiry
	 * - `AT_MOST_ONCE`: no retry on NACK
	 * - `EXACTLY_ONCE`: stops after first delivery
	 *
	 * @template TData - Message payload type.
	 * @param message - Message to dispatch.
	 */
	async dispatch<TData>(message: Message<TData>): Promise<void> {
		const { ttl, deliveryMode, emittedAt } =
			this._extractDeliveryMetadata(message);

		if (await this._circuitBreaker.check(message, this._deliveryPort)) {
			return;
		}

		let acknowledged = false;
		const context = this._buildSubscriberContext(() => {
			acknowledged = true;
		});

		while (!acknowledged) {
			const shouldRetry = await this._attemptDelivery(
				message,
				context,
				ttl,
				emittedAt,
				deliveryMode
			);
			if (!shouldRetry) {
				return;
			}
		}

		this._circuitBreaker.reset();
	}

	/**
	 * Extracts delivery metadata from message headers.
	 */
	private _extractDeliveryMetadata<TData>(message: Message<TData>): {
		ttl: number;
		deliveryMode: DeliveryMode;
		emittedAt: number;
	} {
		const ttl = message.metadata.delivery?.ttl ?? 0;
		const deliveryMode =
			message.metadata.delivery?.mode ?? DeliveryMode.AT_LEAST_ONCE;
		const emittedAt = new Date(message.metadata.emittedAt ?? 0).getTime();
		return { ttl, deliveryMode, emittedAt };
	}

	/**
	 * Builds a subscriber context with an ack callback.
	 */
	private _buildSubscriberContext(onAck: () => void): SubscribersContext {
		return {
			receivedAt: null,
			consumerGroup: this.serviceIdentity.serviceName,
			deliveryAttempt: 0,
			ack: () => {
				onAck();
				return Promise.resolve();
			},
		};
	}

	/**
	 * Attempts a single delivery. Returns true if the caller should retry,
	 * false if the message was acked or delivery mode prohibits retries.
	 */
	private async _attemptDelivery<TData>(
		message: Message<TData>,
		context: SubscribersContext,
		ttl: number,
		emittedAt: number,
		deliveryMode: DeliveryMode
	): Promise<boolean> {
		try {
			const target = await this._resolveTarget();

			const deliveryContext: MessageDeliveryContext = {
				deliveryAttempt: context.deliveryAttempt,
				consumerGroup: context.consumerGroup,
			};
			const sendInput: DeliverySendInput = { url: target, message, context: deliveryContext };
			await this._deliveryPort.send(sendInput);

			context.receivedAt = new Date();
			await context.ack();
			return false;
		} catch (err) {
			context.deliveryAttempt++;

			const handled = await this._errorHandler.handleDeliveryError(
				err,
				message,
				context,
				ttl,
				emittedAt,
				deliveryMode
			);
			if (handled) {
				return false;
			}

			await sleep(Subscription.backoffDelay(context.deliveryAttempt));
		}

		if (
			deliveryMode === DeliveryMode.EXACTLY_ONCE ||
			deliveryMode === DeliveryMode.AT_MOST_ONCE
		) {
			return false;
		}

		return true;
	}

	/**
	 * Resolves the HTTPS endpoint for the subscriber service.
	 *
	 * @returns {Promise<string>} Fully-qualified target URL
	 */
	private async _resolveTarget(): Promise<string> {
		const address = await FIND_A_SERVICE(this.serviceIdentity.serviceName);

		return `https://${address.ip}:${address.port}/${this.callbackURL}`;
	}
}
