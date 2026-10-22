/**
 * Message dispatch coordinator.
 *
 * Maintains an in-memory registry of subscriptions per topic
 * and is responsible for dispatching published messages to all matching
 * subscribers.
 */

import { getLogger } from "@trading-model/contracts/logger-registry";
import type { InstanceId } from "@trading-model/primitives/primitives";
import type { Message } from "@trading-model/validation/domain/contracts/message.types";
import {
	DELIVERY_LATENCY_SECONDS,
	IN_FLIGHT_MESSAGES,
	MESSAGES_PUBLISHED_TOTAL,
} from "../../config/metrics";
import { createMessage } from "../../domain/message-factory";
import type {
	SubscriptionParams,
	TopicSubscription,
} from "../../domain/messaging-types";
import type { MessageDeliveryPort } from "../ports/message-delivery-port";
import { handleAck as logAck, handleNack as logNack } from "./ack-handler";
import { SubscriptionRegistry } from "./subscription-registry";

function isRejected<TValue>(
	result: PromiseSettledResult<TValue>
): result is PromiseRejectedResult {
	return result.status === "rejected";
}

export interface DispatcherDeps {
	deliveryPort: MessageDeliveryPort;
}

export class Dispatcher {
	private readonly _registry: SubscriptionRegistry;

	constructor(deps: DispatcherDeps) {
		this._registry = new SubscriptionRegistry(deps.deliveryPort);
	}

	async publish(
		payload: unknown,
		metadata: Omit<
			import("@trading-model/validation/domain/contracts/message.types").MessageMetadata,
			"emittedAt" | "messageId"
		>
	): Promise<string> {
		const msg = createMessage(payload, metadata);
		MESSAGES_PUBLISHED_TOTAL.inc({ topic: msg.metadata.topic });
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

	unsubscribe(params: TopicSubscription): void {
		this._registry.unsubscribe(params);
	}
}
