import type { Topic } from "@trading-model/common/domain/primitives";
import type { HttpMessageDelivery } from "./http-message-delivery";
import type { SubscriptionParams, TopicSubscription } from "./messaging-types";
import { Subscription } from "./subscription";

export class SubscriptionRegistry {
	/**
	 * In-memory mapping of topics to subscriptions.
	 */
	private _subscriptionsByTopic = new Map<Topic, readonly Subscription[]>();

	constructor(private readonly _deliveryPort: HttpMessageDelivery) {}

	subscribe(params: SubscriptionParams): void {
		const { topic, serviceIdentity, callbackPath } = params;

		const current = this._subscriptionsByTopic.get(topic) ?? [];

		if (
			current.some(
				(sub) => sub.serviceIdentity.instanceId === serviceIdentity.instanceId
			)
		) {
			return;
		}

		const subscription = new Subscription({
			topic,
			callbackPath,
			serviceIdentity,
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

	getSubscriptions(topic: Topic): readonly Subscription[] {
		return this._subscriptionsByTopic.get(topic) ?? [];
	}
}
