/**
 * Message dispatch coordinator.
 *
 * Maintains an in-memory registry of subscriptions per topic
 * and is responsible for dispatching published messages to all matching
 * subscribers.
 */

import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { Message } from "@trading-model/validation/domain/contracts/message.types";
import type { FileDlqRepository } from "../../adapters/outbound/dlq-repository";
import { HttpMessageDelivery } from "../../adapters/outbound/http-message-delivery";
import { getBackpressureRatio as backpressureRatio } from "../../domain/backpressure-monitor";
import { createMessage } from "../../domain/message-factory";
import type {
	SubscriptionParams,
	TopicSubscription,
} from "../../domain/messaging-types";
import { handleAck as logAck, handleNack as logNack } from "./ack-handler";
import { SubscriptionRegistry } from "./subscription-registry";

function isRejected<TValue>(
	result: PromiseSettledResult<TValue>
): result is PromiseRejectedResult {
	return result.status === "rejected";
}

export class Dispatcher {
	private readonly _registry: SubscriptionRegistry;
	private readonly _deliveryPort: HttpMessageDelivery;

	constructor(httpClient: HttpClient, dlqRepository: FileDlqRepository) {
		this._deliveryPort = new HttpMessageDelivery(httpClient, dlqRepository);
		this._registry = new SubscriptionRegistry(this._deliveryPort);
	}

	async publish(
		payload: unknown,
		metadata: Omit<
			import("@trading-model/validation/domain/contracts/message.types").MessageMetadata,
			"emittedAt" | "messageId"
		>
	): Promise<string> {
		const msg = createMessage(payload, metadata);
		await this.dispatch(msg);
		return msg.metadata.messageId!;
	}

	subscribe(params: SubscriptionParams): void {
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
			if (isRejected(result)) {
				logger.error("Message delivery failed", {
					context: { error: result.reason },
				});
			}
		}
	}

	getBackpressureRatio(): number {
		return backpressureRatio();
	}

	handleAck(messageId: string, instanceId: InstanceId): void {
		logAck(messageId, instanceId);
	}

	handleNack(messageId: string, instanceId: InstanceId): void {
		logNack(messageId, instanceId);
	}

	unsubscribe(params: TopicSubscription): void {
		this._registry.unsubscribe(params);
	}
}
