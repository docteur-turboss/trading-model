/**
 * Message acceptance (ADR-0048): delivers nothing. Once a subscriber or a
 * journal group exists for the topic, it writes the message to the durable journal; the delivery
 * workers deliver it afterwards, outside the publisher's request.
 */

import type { MessageJournalPort } from "@trading-model/broker-message/bus/journal.port";
import { createMessage } from "@trading-model/broker-message/bus/message-factory";
import { messageManagerError } from "@trading-model/broker-message/shared/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type {
	Message,
	MessageMetadata,
} from "@trading-model/contracts/message-types";
import {
	MESSAGES_PUBLISHED_TOTAL,
	MESSAGES_UNROUTED_TOTAL,
} from "../../config/metrics";
import type {
	SubscriptionParams,
	TopicSubscription,
} from "../../domain/messaging-types";
import type { SubscriptionRegistry } from "./subscription-registry";

export interface DispatcherDeps {
	registry: SubscriptionRegistry;
	journal: MessageJournalPort;
}

export class Dispatcher {
	constructor(private readonly _deps: DispatcherDeps) {}

	/**
	 * Accepts a message: it is durable when this resolves.
	 *
	 * @returns the `messageId` stamped on the message.
	 * @throws when the topic has no subscriber nor group and the message sets
	 *   `delivery.requireSubscriber` (the publisher sends it again).
	 */
	async publish(
		payload: unknown,
		metadata: Omit<MessageMetadata, "emittedAt" | "messageId">
	): Promise<string> {
		const message = createMessage(payload, metadata);
		const { topic, messageId } = message.metadata;
		MESSAGES_PUBLISHED_TOTAL.inc({ topic });
		const [subscriptions, groups] = await Promise.all([
			this._deps.registry.getSubscriptions(topic),
			this._deps.journal.groups(),
		]);
		// A service with a group waits for the message even when its subscription expired (ADR-0073 §2).
		const services = new Set<string>([
			...subscriptions.map((binding) => binding.serviceIdentity.serviceName),
			...groups
				.filter((group) => group.topic === topic)
				.map((group) => group.service),
		]);
		if (services.size === 0) {
			// No subscriber and no group: the message is dropped. Counted so that a
			// topic nobody subscribes to does not go unnoticed.
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
			return messageId as string;
		}
		await this._deps.journal.append(message, [...services]);
		return messageId as string;
	}

	/**
	 * Replays a dead letter to the one service whose delivery failed, under the
	 * `messageId` it already has (ADR-0043): the other subscribers got it.
	 */
	async republish(message: Message, service: string): Promise<void> {
		await this._deps.journal.append(message, [service], service);
	}

	subscribe(params: SubscriptionParams): Promise<void> {
		return this._deps.registry.subscribe(params);
	}

	unsubscribe(params: TopicSubscription, caller: string): Promise<boolean> {
		return this._deps.registry.unsubscribe(params, caller);
	}
}
