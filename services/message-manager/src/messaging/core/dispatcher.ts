/**
 * Message dispatch coordinator.
 *
 * Maintains an in-memory registry of subscriptions per topic
 * and is responsible for dispatching published messages to all matching
 * subscribers.
 */

import { randomUUID } from "node:crypto";

import type { HttpClient } from "@trading-model/common/config/http-client";
import { logger } from "@trading-model/common/config/logger";
import type {
	Message,
	MessageMetadata,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";
import { toMessageId } from "@trading-model/common/domain/primitives";

import { AckHandler } from "./ack-handler";
import { BackpressureMonitor } from "./backpressure-monitor";
import type { FileDlqRepository } from "./dlq-repository";
import { HttpMessageDelivery } from "./http-message-delivery";
import type { TopicSubscription } from "./messaging-types";
import { sanitizePayload } from "./payload-sanitizer";
import { SubscriptionRegistry } from "./subscription-registry";

export class Dispatcher {
	private readonly _registry: SubscriptionRegistry;
	private readonly _deliveryPort: HttpMessageDelivery;
	private readonly _ackHandler: AckHandler;
	private readonly _backpressureMonitor: BackpressureMonitor;

	constructor(
		httpClient: HttpClient,
		readonly dlqRepository: FileDlqRepository
	) {
		this._deliveryPort = new HttpMessageDelivery(httpClient, dlqRepository);
		this._registry = new SubscriptionRegistry(this._deliveryPort);
		this._ackHandler = new AckHandler();
		this._backpressureMonitor = new BackpressureMonitor();
	}

	async publish(
		payload: unknown,
		metadata: Omit<MessageMetadata, "emittedAt" | "messageId">
	): Promise<string> {
		const Msg: Message = {
			metadata: {
				...metadata,
				emittedAt: new Date(),
				messageId: toMessageId(randomUUID()),
			},
			payload: sanitizePayload(payload),
		};

		await this.dispatch(Msg);
		return Msg.metadata.messageId!;
	}

	subscribe(params: {
		topic: string;
		callbackPath: string;
		consumerIdentity: ServiceIdentity;
	}): void {
		this._registry.subscribe(params);
	}

	async dispatch<TData>(message: Message<TData>) {
		const { topic } = message.metadata;
		const subscriptions = this._registry.getSubscriptions(topic);
		if (!subscriptions?.length) {
			return;
		}

		const results = await Promise.allSettled(
			subscriptions.map((subscription) => subscription.dispatch(message))
		);

		for (const result of results) {
			if (result.status === "rejected") {
				logger.error("Message delivery failed", {
					context: { error: result.reason },
				});
			}
		}
	}

	/**
	 * @deprecated Use `subscribe` instead.
	 */
	registerSubscription(params: {
		topic: string;
		callbackPath: string;
		consumerIdentity: ServiceIdentity;
	}): void {
		this.subscribe(params);
	}

	/**
	 * @deprecated Use `unsubscribe` instead.
	 */
	unregisterSubscription(params: TopicSubscription): void {
		this.unsubscribe(params);
	}

	getBackpressureRatio(): number {
		return this._backpressureMonitor.getBackpressureRatio();
	}

	async handleAck(messageId: string, instanceId: string): Promise<void> {
		return this._ackHandler.handleAck(messageId, instanceId);
	}

	async handleNack(messageId: string, instanceId: string): Promise<void> {
		return this._ackHandler.handleNack(messageId, instanceId);
	}

	unsubscribe(params: TopicSubscription): void {
		this._registry.unsubscribe(params);
	}
}
