import type { ServiceIdentity } from "@trading-model/common/contracts/message.types";

import type { HttpMessageDelivery } from "./http-message-delivery";
import { Subscription } from "./subscription";

/** Coordinates message delivery between published messages and registered subscriptions. */
export class SubscriptionRegistry {
	/**
	 * In-memory mapping of topics to subscriptions.
	 */
	private _subscriptionsByTopic = new Map<string, readonly Subscription[]>();

	constructor(private readonly _deliveryPort: HttpMessageDelivery) {}

	/** Register a subscription for a topic. */
	subscribe(params: {
		topic: string;
		callbackPath: string;
		consumerIdentity: ServiceIdentity;
	}): void {
		const { topic, consumerIdentity, callbackPath } = params;

		const current = this._subscriptionsByTopic.get(topic) ?? [];

		if (
			current.some(
				(sub) => sub.serviceIdentity.instanceId === consumerIdentity.instanceId
			)
		) {
			return;
		}

		const subscription = new Subscription({
			topic,
			callbackURL: callbackPath,
			serviceIdentity: consumerIdentity,
			deliveryPort: this._deliveryPort,
		});

		this._subscriptionsByTopic.set(topic, [...current, subscription]);
	}

	/** Unregister a subscription from a topic. */
	unsubscribe(params: { topic: string; instanceId: string }): void {
		const { topic, instanceId } = params;

		const current = this._subscriptionsByTopic.get(topic);
		if (!current) {
			return;
		}

		const remaining = current.filter(
			(sub) => sub.serviceIdentity.instanceId !== instanceId
		);

		if (remaining.length === 0) {
			this._subscriptionsByTopic.delete(topic);
		}
		this._subscriptionsByTopic.set(topic, remaining);
	}

	/** Get subscriptions for a topic. */
	getSubscriptions(topic: string): readonly Subscription[] {
		return this._subscriptionsByTopic.get(topic) ?? [];
	}
}
