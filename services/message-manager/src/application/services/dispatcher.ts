/**
 * Message dispatch coordinator.
 *
 * Reads the subscriptions of each topic from the shared subscription store
 * and dispatches published messages to all matching subscribers.
 */

import { messageManagerError } from "@trading-model/common/utils/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { Message } from "@trading-model/contracts/message-types";
import type { InstanceId } from "@trading-model/primitives/primitives";
import {
	DELIVERY_LATENCY_SECONDS,
	IN_FLIGHT_MESSAGES,
	MESSAGES_PUBLISHED_TOTAL,
	MESSAGES_UNROUTED_TOTAL,
} from "../../config/metrics";
import { createMessage } from "../../domain/message-factory";
import type {
	SubscriptionParams,
	TopicSubscription,
} from "../../domain/messaging-types";
import type { MessageDeliveryPort } from "../ports/message-delivery-port";
import type { SubscriptionStorePort } from "../ports/subscription-store-port";
import { handleAck as logAck, handleNack as logNack } from "./ack-handler";
import { SubscriptionRegistry } from "./subscription-registry";

function isRejected<TValue>(
	result: PromiseSettledResult<TValue>
): result is PromiseRejectedResult {
	return result.status === "rejected";
}

export interface DispatcherDeps {
	deliveryPort: MessageDeliveryPort;
	subscriptionStore: SubscriptionStorePort;
}

export class Dispatcher {
	private readonly _registry: SubscriptionRegistry;

	constructor(deps: DispatcherDeps) {
		this._registry = new SubscriptionRegistry(
			deps.deliveryPort,
			deps.subscriptionStore
		);
	}

	async publish(
		payload: unknown,
		metadata: Omit<
			import("@trading-model/contracts/message-types").MessageMetadata,
			"emittedAt" | "messageId"
		>
	): Promise<string> {
		const msg = createMessage(payload, metadata);
		MESSAGES_PUBLISHED_TOTAL.inc({ topic: msg.metadata.topic });
		await this.dispatch(msg);
		return msg.metadata.messageId!;
	}

	subscribe(params: SubscriptionParams): Promise<void> {
		return this._registry.subscribe(params);
	}

	async dispatch<TData>(message: Message<TData>) {
		const { topic, messageId } = message.metadata;
		const subscriptions = await this._registry.getSubscriptions(topic);
		if (subscriptions.length === 0) {
			// Nobody to deliver to: the message is dropped. Counted so that a
			// subscriber that stopped subscribing does not go unnoticed.
			MESSAGES_UNROUTED_TOTAL.inc({ topic });
			if (message.metadata.delivery?.requireSubscriber) {
				// The publisher sends it again: after an outage of ours, its
				// backlog must not reach us before the subscribers renewed.
				getLogger().warn("Message refused: no subscriber for its topic", {
					context: { topic, messageId },
				});
				throw messageManagerError(
					`No subscriber for topic ${topic}: publish refused, send it again`
				);
			}
			getLogger().warn("Message dropped: no subscriber for its topic", {
				context: { topic, messageId },
			});
			return;
		}
		await this._deliverToAll(message, subscriptions);
	}

	private async _deliverToAll<TData>(
		message: Message<TData>,
		subscriptions: readonly import("./subscription").Subscription[]
	): Promise<void> {
		const start = Date.now();
		IN_FLIGHT_MESSAGES.inc();
		try {
			const results = await Promise.allSettled(
				subscriptions.map((subscription) => subscription.dispatch(message))
			);
			for (const result of results) {
				if (isRejected(result)) {
					getLogger().error("Message delivery failed", {
						context: { error: result.reason },
					});
				}
			}
		} finally {
			IN_FLIGHT_MESSAGES.dec();
			DELIVERY_LATENCY_SECONDS.observe(
				{ topic: message.metadata.topic },
				(Date.now() - start) / 1000
			);
		}
	}

	getBackpressureRatio(): number {
		return 0;
	}

	handleAck(messageId: string, instanceId: InstanceId): void {
		logAck(messageId, instanceId);
	}

	handleNack(messageId: string, instanceId: InstanceId): void {
		logNack(messageId, instanceId);
	}

	unsubscribe(params: TopicSubscription): Promise<void> {
		return this._registry.unsubscribe(params);
	}
}
