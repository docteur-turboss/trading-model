import type { Topic } from "@trading-model/primitives/primitives";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";
import { SUBSCRIPTION_COUNT } from "../../config/metrics";
import type {
	SubscriptionParams,
	TopicSubscription,
} from "../../domain/messaging-types";
import type { MessageJournalPort } from "../../domain/ports/message-journal.port";
import type { SubscriptionStorePort } from "../../domain/ports/subscription-store.port";

/**
 * Who is subscribed to what (shared store), and the journal group of each
 * subscriber service: a group outlives its subscribers so that what was
 * accepted for a service waits for it.
 */
export class SubscriptionRegistry {
	constructor(
		private readonly _store: SubscriptionStorePort,
		private readonly _journal: MessageJournalPort
	) {}

	/** Creates or renews a subscription (subscribers renew theirs periodically). */
	async subscribe(params: SubscriptionParams): Promise<void> {
		await this._store.save(params);
		await this._journal.register({
			topic: params.topic,
			service: params.serviceIdentity.serviceName,
		});
		await this.getSubscriptions(params.topic);
	}

	async unsubscribe(params: TopicSubscription): Promise<void> {
		await this._store.remove(params.topic, params.instanceId);
		await this.getSubscriptions(params.topic);
	}

	/** Live subscriptions of a topic, one per subscribed instance. */
	async getSubscriptions(topic: Topic): Promise<readonly TopicBinding[]> {
		const bindings = await this._store.list(topic);
		SUBSCRIPTION_COUNT.set({ topic }, bindings.length);
		return bindings;
	}
}
