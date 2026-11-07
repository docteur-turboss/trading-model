import { beforeEach, describe, expect, it } from "@jest/globals";
import type { TopicBinding } from "@trading-model/primitives/topic-binding";
import { InMemorySubscriptionStore } from "../../../../src/adapters/outbound/in-memory-subscription-store";
import { RedisSubscriptionStore } from "../../../../src/adapters/outbound/redis-subscription-store";
import {
	SUBSCRIPTION_TTL_MS,
	type SubscriptionStorePort,
} from "../../../../src/application/ports/subscription-store-port";
import { mockSubscribeParams } from "../../../fixtures/broker.fixture";

/** Hash commands of ioredis over a Map, enough for RedisSubscriptionStore. */
function fakeRedis() {
	const hashes = new Map<string, Map<string, string>>();
	const expiries = new Map<string, number>();
	const multi = () => {
		const queued: (() => void)[] = [];
		const chain = {
			hset: (key: string, field: string, value: string) => {
				queued.push(() => {
					const hash = hashes.get(key) ?? new Map<string, string>();
					hash.set(field, value);
					hashes.set(key, hash);
				});
				return chain;
			},
			pexpire: (key: string, ms: number) => {
				queued.push(() => expiries.set(key, ms));
				return chain;
			},
			exec: async () => queued.map((command) => [null, command()]),
		};
		return chain;
	};
	return {
		hashes,
		expiries,
		multi,
		hgetall: async (key: string) =>
			Object.fromEntries(hashes.get(key) ?? new Map<string, string>()),
		hdel: async (key: string, ...fields: string[]) => {
			for (const field of fields) {
				hashes.get(key)?.delete(field);
			}
			return fields.length;
		},
	};
}

const binding = mockSubscribeParams as unknown as TopicBinding;
const sibling = {
	...binding,
	serviceIdentity: { ...binding.serviceIdentity, instanceId: "subscriber-2" },
} as TopicBinding;

const stores: [string, (now: () => number) => SubscriptionStorePort][] = [
	["InMemorySubscriptionStore", (now) => new InMemorySubscriptionStore(now)],
	[
		"RedisSubscriptionStore",
		(now) =>
			new RedisSubscriptionStore({
				redis: fakeRedis() as never,
				keyPrefix: "spec",
				now,
			}),
	],
];

describe.each(stores)("%s", (_name, build) => {
	let clock: number;
	let store: SubscriptionStorePort;

	beforeEach(() => {
		clock = 1_000_000;
		store = build(() => clock);
	});

	it("should list the subscriptions of a topic only", async () => {
		await store.save(binding);
		await store.save(sibling);
		await store.save({ ...binding, topic: "other.topic" } as TopicBinding);

		const listed = await store.list(binding.topic);

		expect(listed.map((b) => b.serviceIdentity.instanceId).sort()).toEqual([
			"subscriber-1",
			"subscriber-2",
		]);
	});

	it("should keep one subscription per instance, with the latest callback", async () => {
		await store.save(binding);
		await store.save({ ...binding, callbackPath: "new/path" });

		await expect(store.list(binding.topic)).resolves.toEqual([
			expect.objectContaining({ callbackPath: "new/path" }),
		]);
	});

	it("should forget a removed subscription", async () => {
		await store.save(binding);
		await store.save(sibling);

		await store.remove(binding.topic, binding.serviceIdentity.instanceId);

		await expect(store.list(binding.topic)).resolves.toEqual([sibling]);
	});

	it("should ignore removing an unknown subscription", async () => {
		await expect(
			store.remove("missing.topic" as never, "nobody" as never)
		).resolves.toBeUndefined();
	});

	it("should expire a subscription not renewed within the TTL", async () => {
		await store.save(binding);
		clock += SUBSCRIPTION_TTL_MS / 2;
		await store.save(sibling);

		clock += SUBSCRIPTION_TTL_MS / 2 + 1;
		await expect(store.list(binding.topic)).resolves.toEqual([sibling]);

		await store.save(binding);
		clock += SUBSCRIPTION_TTL_MS - 1;
		await expect(store.list(binding.topic)).resolves.toEqual([binding]);
	});
});

describe("RedisSubscriptionStore keys", () => {
	it("should store one hash per topic that expires with its last renewal", async () => {
		const redis = fakeRedis();
		const store = new RedisSubscriptionStore({
			redis: redis as never,
			keyPrefix: "trading-model:message-manager",
		});

		await store.save(binding);

		const key = "trading-model:message-manager:subscriptions:test.topic";
		expect([...(redis.hashes.get(key)?.keys() ?? [])]).toEqual([
			"subscriber-1",
		]);
		expect(redis.expiries.get(key)).toBe(SUBSCRIPTION_TTL_MS);
	});
});
