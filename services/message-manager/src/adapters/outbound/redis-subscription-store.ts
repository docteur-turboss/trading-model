import type { InstanceId, Topic } from "@trading-model/primitives/primitives";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";
import type Redis from "ioredis";
import {
	type StoredSubscription,
	SUBSCRIPTION_TTL_MS,
	type SubscriptionStorePort,
} from "../../application/ports/subscription-store-port";

export interface RedisSubscriptionStoreDeps {
	redis: Pick<Redis, "multi" | "hgetall" | "hdel">;
	keyPrefix: string;
	now?: () => number;
}

/**
 * Subscriptions shared by every message-manager replica: one hash per topic,
 * one field per subscribed instance. The hash expires with its last renewal,
 * expired fields are dropped when the topic is read. Instance fields only
 * track liveness: the registry delivers once per service (ADR-0043).
 */
export class RedisSubscriptionStore implements SubscriptionStorePort {
	private readonly _now: () => number;

	constructor(private readonly _deps: RedisSubscriptionStoreDeps) {
		this._now = _deps.now ?? Date.now;
	}

	async save(binding: TopicBinding): Promise<void> {
		const key = this._key(binding.topic);
		const stored: StoredSubscription = { binding, renewedAt: this._now() };
		// One round trip; the hash never lives without its expiry.
		await this._deps.redis
			.multi()
			.hset(key, binding.serviceIdentity.instanceId, JSON.stringify(stored))
			.pexpire(key, SUBSCRIPTION_TTL_MS)
			.exec();
	}

	async remove(topic: Topic, instanceId: InstanceId): Promise<void> {
		await this._deps.redis.hdel(this._key(topic), instanceId);
	}

	async list(topic: Topic): Promise<TopicBinding[]> {
		const fields = await this._deps.redis.hgetall(this._key(topic));
		const oldest = this._now() - SUBSCRIPTION_TTL_MS;
		const live: TopicBinding[] = [];
		const expired: string[] = [];
		for (const [instanceId, raw] of Object.entries(fields)) {
			const stored = JSON.parse(raw) as StoredSubscription;
			if (stored.renewedAt < oldest) {
				expired.push(instanceId);
			} else {
				live.push(stored.binding);
			}
		}
		if (expired.length > 0) {
			await this._deps.redis.hdel(this._key(topic), ...expired);
		}
		return live;
	}

	private _key(topic: Topic): string {
		return `${this._deps.keyPrefix}:subscriptions:${topic}`;
	}
}
