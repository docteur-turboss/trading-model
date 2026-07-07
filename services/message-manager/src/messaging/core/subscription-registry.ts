import type { ServiceIdentity } from "@trading-model/common/contracts/message.types";

import type { HttpMessageDelivery } from "./http-message-delivery";
import type { TopicSubscription } from "./messaging-types";
import { Subscription } from "./subscription";

export class SubscriptionRegistry {
	/**
	 * In-memory mapping of topics to subscriptions.
	 */
	private _subscriptionsByTopic = new Map<string, readonly Subscription[]>();

	constructor(private readonly _deliveryPort: HttpMessageDelivery) {}

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

	unsubscribe(params: TopicSubscription): void {
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

	getSubscriptions(topic: string): readonly Subscription[] {
		return this._subscriptionsByTopic.get(topic) ?? [];
	}
}
