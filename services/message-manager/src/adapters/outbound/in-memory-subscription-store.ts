import type { InstanceId, Topic } from "@trading-model/primitives/primitives";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";
import {
	type StoredSubscription,
	SUBSCRIPTION_TTL_MS,
	type SubscriptionStorePort,
} from "../../application/ports/subscription-store-port";

/** Single-replica store (no Redis configured): lost on restart. */
export class InMemorySubscriptionStore implements SubscriptionStorePort {
	private readonly _byTopic = new Map<
		Topic,
		Map<InstanceId, StoredSubscription>
	>();

	constructor(private readonly _now: () => number = Date.now) {}

	save(binding: TopicBinding): Promise<void> {
		let subscriptions = this._byTopic.get(binding.topic);
		if (!subscriptions) {
			subscriptions = new Map();
			this._byTopic.set(binding.topic, subscriptions);
		}
		subscriptions.set(binding.serviceIdentity.instanceId, {
			binding,
			renewedAt: this._now(),
		});
		return Promise.resolve();
	}

	remove(topic: Topic, instanceId: InstanceId): Promise<void> {
		const subscriptions = this._byTopic.get(topic);
		subscriptions?.delete(instanceId);
		if (subscriptions?.size === 0) {
			this._byTopic.delete(topic);
		}
		return Promise.resolve();
	}

	async list(topic: Topic): Promise<TopicBinding[]> {
		const subscriptions = this._byTopic.get(topic);
		if (!subscriptions) {
			return [];
		}
		const oldest = this._now() - SUBSCRIPTION_TTL_MS;
		for (const [instanceId, stored] of subscriptions) {
			if (stored.renewedAt < oldest) {
				await this.remove(topic, instanceId);
			}
		}
		return [...subscriptions.values()].map((stored) => stored.binding);
	}
}
