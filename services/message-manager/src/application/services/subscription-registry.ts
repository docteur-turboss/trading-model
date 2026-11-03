import type { Topic } from "@trading-model/primitives/primitives";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";
import { SUBSCRIPTION_COUNT } from "../../config/metrics";
import type {
	SubscriptionParams,
	TopicSubscription,
} from "../../domain/messaging-types";
import type { MessageDeliveryPort } from "../ports/message-delivery-port";
import type { SubscriptionStorePort } from "../ports/subscription-store-port";
import { Subscription } from "./subscription";

function localKey(topic: Topic, binding: TopicBinding): string {
	return `${topic}|${binding.serviceIdentity.instanceId}`;
}

export class SubscriptionRegistry {
	/**
	 * Delivery state (circuit breaker) of each subscription, kept per replica.
	 * Which subscriptions exist is read from the shared store.
	 */
	private readonly _local = new Map<string, Subscription>();

	constructor(
		private readonly _deliveryPort: MessageDeliveryPort,
		private readonly _store: SubscriptionStorePort
	) {}

	/** Creates or renews a subscription (subscribers renew theirs periodically). */
	async subscribe(params: SubscriptionParams): Promise<void> {
		await this._store.save(params);
		await this.getSubscriptions(params.topic);
	}

	async unsubscribe(params: TopicSubscription): Promise<void> {
		await this._store.remove(params.topic, params.instanceId);
		await this.getSubscriptions(params.topic);
	}

	async getSubscriptions(topic: Topic): Promise<readonly Subscription[]> {
		const bindings = await this._store.list(topic);
		const live = new Set<string>();
		const subscriptions = bindings.map((binding) => {
			const key = localKey(topic, binding);
			live.add(key);
			return this._localSubscription(key, binding);
		});
		this._forgetOthers(topic, live);
		SUBSCRIPTION_COUNT.set({ topic }, subscriptions.length);
		return subscriptions;
	}

	private _localSubscription(key: string, binding: TopicBinding): Subscription {
		const existing = this._local.get(key);
		if (existing && existing.callbackPath === binding.callbackPath) {
			return existing;
		}
		const subscription = new Subscription({
			...binding,
			deliveryPort: this._deliveryPort,
		});
		this._local.set(key, subscription);
		return subscription;
	}

	private _forgetOthers(topic: Topic, live: Set<string>): void {
		for (const [key, subscription] of this._local) {
			if (subscription.topic === topic && !live.has(key)) {
				this._local.delete(key);
			}
		}
	}
}
