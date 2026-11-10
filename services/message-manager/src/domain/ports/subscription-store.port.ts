import type { InstanceId, Topic } from "@trading-model/primitives/primitives";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";

/**
 * Lifetime of a subscription without renewal. Subscribers renew theirs every
 * 15s (SUBSCRIPTION_REFRESH_MS, broker-message): four missed renewals mean
 * the subscriber is gone.
 */
export const SUBSCRIPTION_TTL_MS = 60_000;

/** A binding as a store keeps it, with its last renewal time. */
export interface StoredSubscription {
	binding: TopicBinding;
	renewedAt: number;
}

/**
 * Where subscriptions live. Every message-manager replica reads the same
 * store: a subscription made on one replica routes the messages published on
 * any other, and survives a restart.
 */
export interface SubscriptionStorePort {
	/** Creates or renews the subscription of an instance to a topic. */
	save(binding: TopicBinding): Promise<void>;
	remove(topic: Topic, instanceId: InstanceId): Promise<void>;
	/** Subscriptions of a topic renewed within SUBSCRIPTION_TTL_MS. */
	list(topic: Topic): Promise<TopicBinding[]>;
}
