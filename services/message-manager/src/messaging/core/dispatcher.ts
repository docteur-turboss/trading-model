/**
 * Message dispatch coordinator.
 *
 * Maintains an in-memory registry of subscriptions per topic
 * and is responsible for dispatching published messages to all matching
 * subscribers.
 */

import type { HttpClient } from "@trading-model/common/config/http-client";
import { logger } from "@trading-model/common/config/logger";
import type {
	Message,
	ServiceIdentity,
} from "@trading-model/common/contracts/message.types";

import { AckHandler } from "./ack-handler";
import { BackpressureMonitor } from "./backpressure-monitor";
import type { FileDlqRepository } from "./dlq-repository";
import { HttpMessageDelivery } from "./http-message-delivery";
import { MessageFactory } from "./message-factory";
import type { TopicSubscription } from "./messaging-types";
import { SubscriptionRegistry } from "./subscription-registry";

export class Dispatcher {
	private readonly _registry: SubscriptionRegistry;
	private readonly _deliveryPort: HttpMessageDelivery;
	private readonly _ackHandler: AckHandler;
	private readonly _backpressureMonitor: BackpressureMonitor;
	private readonly _messageFactory: MessageFactory;

	constructor(
		httpClient: HttpClient,
		readonly dlqRepository: FileDlqRepository
	) {
		this._deliveryPort = new HttpMessageDelivery(httpClient, dlqRepository);
		this._registry = new SubscriptionRegistry(this._deliveryPort);
		this._ackHandler = new AckHandler();
		this._backpressureMonitor = new BackpressureMonitor();
		this._messageFactory = new MessageFactory();
	}

	async publish(
		payload: unknown,
		metadata: Omit<
			import("@trading-model/common/contracts/message.types").MessageMetadata,
			"emittedAt" | "messageId"
		>
	): Promise<string> {
		const msg = this._messageFactory.create(payload, metadata);
		await this.dispatch(msg);
		return msg.metadata.messageId!;
	}

	subscribe(params: {
		topic: string;
		callbackPath: string;
		consumerIdentity: ServiceIdentity;
	}): void {
		this._registry.subscribe(params);
	}

	async dispatch<TData>(message: Message<TData>) {
		const subscriptions = this._getSubscriptionsForMessage(message);
		if (!subscriptions) {
			return;
		}
		await this._deliverToAll(message, subscriptions);
	}

	private _getSubscriptionsForMessage<TData>(
		message: Message<TData>
	): readonly import("./subscription").Subscription[] | undefined {
		const { topic } = message.metadata;
		const subscriptions = this._registry.getSubscriptions(topic);
		if (!subscriptions?.length) {
			return;
		}
		return subscriptions;
	}

	private async _deliverToAll<TData>(
		message: Message<TData>,
		subscriptions: readonly import("./subscription").Subscription[]
	): Promise<void> {
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

	handleAck(messageId: string, instanceId: string): void {
		this._ackHandler.handleAck(messageId, instanceId);
	}

	handleNack(messageId: string, instanceId: string): void {
		this._ackHandler.handleNack(messageId, instanceId);
	}

	unsubscribe(params: TopicSubscription): void {
		this._registry.unsubscribe(params);
	}
}
