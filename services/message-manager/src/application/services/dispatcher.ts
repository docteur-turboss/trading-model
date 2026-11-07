/**
 * Message acceptance (ADR-0048): delivers nothing. Once a subscriber exists
 * for the topic, it writes the message to the durable journal; the delivery
 * workers deliver it afterwards, outside the publisher's request.
 */

import { messageManagerError } from "@trading-model/broker-message/shared/errors";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { MessageMetadata } from "@trading-model/contracts/message-types";
import {
	MESSAGES_PUBLISHED_TOTAL,
	MESSAGES_UNROUTED_TOTAL,
} from "../../config/metrics";
import { createMessage } from "../../domain/message-factory";
import type {
	SubscriptionParams,
	TopicSubscription,
} from "../../domain/messaging-types";
import type { MessageJournalPort } from "../ports/message-journal-port";
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
	 * @throws when the topic has no subscriber and the message sets
	 *   `delivery.requireSubscriber` (the publisher sends it again).
	 */
	async publish(
		payload: unknown,
		metadata: Omit<MessageMetadata, "emittedAt" | "messageId">
	): Promise<string> {
		const message = createMessage(payload, metadata);
		const { topic, messageId } = message.metadata;
		MESSAGES_PUBLISHED_TOTAL.inc({ topic });
		const subscriptions = await this._deps.registry.getSubscriptions(topic);
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
			return messageId as string;
		}
		const services = new Set<string>(
			subscriptions.map((binding) => binding.serviceIdentity.serviceName)
		);
		await this._deps.journal.append(message, [...services]);
		return messageId as string;
	}

	subscribe(params: SubscriptionParams): Promise<void> {
		return this._deps.registry.subscribe(params);
	}

	unsubscribe(params: TopicSubscription): Promise<void> {
		return this._deps.registry.unsubscribe(params);
	}
}
