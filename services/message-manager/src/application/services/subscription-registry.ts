import type { Topic } from "@trading-model/primitives/primitives";
import { SUBSCRIPTION_COUNT } from "../../config/metrics";
import type {
	SubscriptionParams,
	TopicSubscription,
} from "../../domain/messaging-types";
import type { MessageDeliveryPort } from "../ports/message-delivery-port";
import { Subscription } from "./subscription";

export class SubscriptionRegistry {
	/**
	 * In-memory mapping of topics to subscriptions.
	 */
	private _subscriptionsByTopic = new Map<Topic, readonly Subscription[]>();

	constructor(private readonly _deliveryPort: MessageDeliveryPort) {}

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

		const subscriptions = [...current, subscription];
		this._subscriptionsByTopic.set(topic, subscriptions);
		SUBSCRIPTION_COUNT.set({ topic }, subscriptions.length);
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
		SUBSCRIPTION_COUNT.set({ topic }, remaining.length);
	}

	getSubscriptions(topic: Topic): readonly Subscription[] {
		return this._subscriptionsByTopic.get(topic) ?? [];
	}
}
