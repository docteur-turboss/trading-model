import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";
import Redis from "ioredis";
import { RedisSubscriptionStore } from "../../src/adapters/outbound/redis-subscription-store";
import { SUBSCRIPTION_TTL_MS } from "../../src/application/ports/subscription-store-port";
import { mockSubscribeParams } from "../fixtures/broker.fixture";

const KEY_PREFIX = "message-manager-db-spec";
const replicaA = new Redis(process.env.TEST_REDIS_URL as string);
const replicaB = new Redis(process.env.TEST_REDIS_URL as string);

const binding = mockSubscribeParams as unknown as TopicBinding;
const topicKey = `${KEY_PREFIX}:subscriptions:${binding.topic}`;

function storeOn(redis: Redis, now?: () => number): RedisSubscriptionStore {
	return new RedisSubscriptionStore({ redis, keyPrefix: KEY_PREFIX, now });
}

beforeEach(async () => {
	await replicaA.flushdb();
});

afterAll(async () => {
	await replicaA.quit();
	await replicaB.quit();
});

describe("RedisSubscriptionStore — real Redis", () => {
	it("should route a subscription made on one replica from another", async () => {
		await storeOn(replicaA).save(binding);

		await expect(storeOn(replicaB).list(binding.topic)).resolves.toEqual([
			binding,
		]);
	});

	it("should keep the subscriptions across a message-manager restart", async () => {
		await storeOn(replicaA).save(binding);

		const restarted = storeOn(replicaB);

		await expect(restarted.list(binding.topic)).resolves.toHaveLength(1);
	});

	it("should drop expired subscriptions and let the topic key expire", async () => {
		let clock = Date.now();
		const store = storeOn(replicaA, () => clock);
		await store.save(binding);

		const ttl = await replicaA.pttl(topicKey);
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(SUBSCRIPTION_TTL_MS);

		clock += SUBSCRIPTION_TTL_MS + 1;
		await expect(store.list(binding.topic)).resolves.toEqual([]);
		await expect(replicaA.hlen(topicKey)).resolves.toBe(0);
	});

	it("should unsubscribe on every replica", async () => {
		await storeOn(replicaA).save(binding);

		await storeOn(replicaB).remove(
			binding.topic,
			binding.serviceIdentity.instanceId
		);

		await expect(storeOn(replicaA).list(binding.topic)).resolves.toEqual([]);
	});
});
