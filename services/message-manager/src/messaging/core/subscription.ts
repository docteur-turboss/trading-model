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
import { DeliveryMode } from "@trading-model/common/config/delivery-mode.types";
import type {
	Message,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";
import { AppError, ErrorCodes } from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";
import { FIND_A_SERVICE } from "../../config/address-manager";
import { logger } from "../../config/logger";
import type {
	MessageDeliveryContext,
	MessageDeliveryPort,
} from "./message-delivery-port";

/** Maximum number of delivery retries before routing to DLQ. */
const MAX_RETRIES = 10;

/** Base delay (ms) for exponential backoff between retries. */
const BaseDelayMs = 1000;

/** Maximum delay (ms) cap for exponential backoff. */
const MaxDelayMs = 60_000;

/** Random jitter factor applied to backoff delay (±20%). */
const JitterFactor = 0.2;

/** Consecutive dispatch failures before the circuit breaker opens. */
const CIRCUIT_BREAKER_THRESHOLD = 5;

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
	/** Consecutive dispatch failures across messages (circuit breaker state). */
	private _failureCount = 0;

	/**
	 * Computes exponential backoff delay with jitter for retry.
	 *
	 * @param deliveryAttempt - Current attempt number (0-based).
	 * @returns Delay in milliseconds.
	 */
	static backoffDelay(deliveryAttempt: number): number {
		const delay = Math.min(BaseDelayMs * 2 ** deliveryAttempt, MaxDelayMs);
		const jitter = delay * JitterFactor * (Math.random() * 2 - 1);
		return Math.max(0, Math.round(delay + jitter));
	}

	/**
	 * @param topic - Topic name subscribed to.
	 * @param callbackURL - Relative HTTP endpoint for message delivery.
	 * @param serviceIdentity - Identity of the consuming service.
	 * @param deliveryPort - Abstract delivery port for sending and dead-lettering.
	 */
	constructor(
		public readonly topic: string,
		public readonly callbackURL: string,
		public readonly serviceIdentity: ServiceIdentity,
		private readonly _deliveryPort: MessageDeliveryPort
	) {}

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
		const ttl = message.metadata.delivery?.ttl ?? 0;
		const deliveryMode =
			message.metadata.delivery?.mode ?? DeliveryMode.AT_LEAST_ONCE;

		const emittedAt = new Date(message.metadata.emittedAt ?? 0).getTime();

		if (this._failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
			logger.warn("Circuit breaker open — rejecting dispatch", {
				topic: this.topic,
				service: this.serviceIdentity.serviceName,
				failureCount: this._failureCount,
			});
			await this._deliveryPort.markDeadLetter(
				message,
				"CIRCUIT_OPEN",
				this._failureCount
			);
			return;
		}

		let acknowledged = false;

		const context: SubscribersContext = {
			receivedAt: null,
			consumerGroup: this.serviceIdentity.serviceName,
			deliveryAttempt: 0,

			ack: () => {
				acknowledged = true;
				return Promise.resolve();
			},
		};

		while (!acknowledged) {
			try {
				const target = await this._resolveTarget();

				const deliveryContext: MessageDeliveryContext = {
					deliveryAttempt: context.deliveryAttempt,
					consumerGroup: context.consumerGroup,
				};
				await this._deliveryPort.send(target, message, deliveryContext);

				context.receivedAt = new Date();
				await context.ack();
			} catch (err) {
				context.deliveryAttempt++;

				if (
					err instanceof AppError &&
					err.code === ErrorCodes.DEAD_LETTER_ERROR
				) {
					const reason: string = err.reason ?? "NO_REASON";
					await this._deliveryPort.markDeadLetter(
						message,
						reason,
						context.deliveryAttempt
					);
					return;
				}

				if (this._isExpired(ttl, emittedAt)) {
					await this._deliveryPort.markDeadLetter(
						message,
						"TTL_EXPIRED",
						context.deliveryAttempt
					);
					return;
				}

				if (deliveryMode === DeliveryMode.AT_MOST_ONCE) {
					return;
				}

				if (context.deliveryAttempt >= MAX_RETRIES) {
					this._failureCount++;
					logger.error("Max retries exceeded — routing to DLQ", {
						topic: this.topic,
						service: this.serviceIdentity.serviceName,
						deliveryAttempt: context.deliveryAttempt,
					});
					await this._deliveryPort.markDeadLetter(
						message,
						"MAX_RETRIES_EXCEEDED",
						context.deliveryAttempt
					);
					return;
				}

				await sleep(Subscription.backoffDelay(context.deliveryAttempt));
			}

			if (
				deliveryMode === DeliveryMode.EXACTLY_ONCE ||
				deliveryMode === DeliveryMode.AT_MOST_ONCE
			) {
				return;
			}
		}

		this._failureCount = 0;
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

	/**
	 * Determines if a message has exceeded its TTL.
	 *
	 * @param {number} ttl TTL in milliseconds
	 * @param {number} emittedAt Timestamp when message was emitted
	 * @returns {boolean} True if expired, false otherwise
	 */
	private _isExpired(ttl: number, emittedAt: number): boolean {
		if (ttl <= 0 || emittedAt <= 0) {
			return false;
		}
		return emittedAt + ttl < Date.now();
	}
}
