import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import Redis from "ioredis";
import { RedisInstanceStore } from "../../src/adapters/outbound/redis-instance-store";
import {
	otherServiceInstance,
	secondServiceInstance,
	validServiceInstance,
} from "../fixtures";

const KEY_PREFIX = "discovery-db-spec";
const redis = new Redis(process.env.TEST_REDIS_URL as string);

function storeWith(client: Redis = redis): RedisInstanceStore {
	return new RedisInstanceStore({
		redis: client,
		keyPrefix: KEY_PREFIX,
		signingSecret: "db-spec-secret",
	});
}

function identity(instance: ServiceInstance): ServiceIdentity {
	return {
		serviceName: instance.serviceName,
		instanceId: instance.instanceId,
	} as ServiceIdentity;
}

const instance = validServiceInstance() as unknown as ServiceInstance;
const sibling = secondServiceInstance() as unknown as ServiceInstance;
const other = otherServiceInstance() as unknown as ServiceInstance;

beforeEach(async () => {
	await redis.flushdb();
});

afterAll(async () => {
	await redis.quit();
});

describe("RedisInstanceStore — real Redis", () => {
	it("should register instances and list them by service", async () => {
		const store = storeWith();

		await Promise.all(
			[instance, sibling, other].map((i) => store.registerInstance(i))
		);

		await expect(store.listServiceNames()).resolves.toEqual(
			expect.arrayContaining([instance.serviceName, other.serviceName])
		);
		const siblings = await store.getInstances(instance.serviceName as never);
		expect(siblings.map((i) => i.instanceId).sort()).toEqual(
			[instance.instanceId, sibling.instanceId].sort()
		);
	});

	it("should keep the token and first registration time when an instance re-registers", async () => {
		const store = storeWith();
		const token = await store.registerInstance(instance);
		const first = await store.getInstance(identity(instance));

		const again = await store.registerInstance({
			...instance,
			registeredAt: (Date.now() + 60_000) as never,
		});

		expect(again).toBe(token);
		await expect(store.getInstance(identity(instance))).resolves.toMatchObject({
			registeredAt: first?.registeredAt,
		});
	});

	it("should hand out a single token to concurrent registrations of the same instance", async () => {
		const stores = Array.from({ length: 8 }, () => storeWith());

		const tokens = await Promise.all(
			stores.map((s) => s.registerInstance(instance))
		);

		expect(new Set(tokens).size).toBe(1);
	});

	it("should refresh the heartbeat of a registered instance only", async () => {
		const store = storeWith();
		await store.registerInstance({ ...instance, lastHeartbeat: 0 as never });

		await expect(store.updateHeartbeat(identity(instance))).resolves.toBe(
			instance.ttl
		);
		await expect(store.updateHeartbeat(identity(other))).resolves.toBe(false);

		const stored = await store.getInstance(identity(instance));
		expect(stored?.lastHeartbeat).toBeGreaterThan(0);
	});

	it("should remove every key of an instance", async () => {
		const store = storeWith();
		await store.registerInstance(instance);
		await store.updateHeartbeat(identity(instance));

		await expect(store.removeInstance(identity(instance))).resolves.toBe(true);

		await expect(redis.keys(`${KEY_PREFIX}*`)).resolves.toEqual([]);
		await expect(store.removeInstance(identity(instance))).resolves.toBe(false);
	});

	it("should not resurrect an instance removed while its heartbeat was in flight", async () => {
		const store = storeWith();
		await store.registerInstance(instance);
		// The stale-instance cleaner removes the instance between the heartbeat's
		// membership check and its write.
		const racing = new Proxy(redis, {
			get(target, prop, receiver) {
				if (prop === "get") {
					return async (key: string) => {
						const value = await target.get(key);
						await store.removeInstance(identity(instance));
						return value;
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});

		await storeWith(racing).updateHeartbeat(identity(instance));

		await expect(
			store.getInstance(identity(instance))
		).resolves.toBeUndefined();
		await expect(redis.keys(`${KEY_PREFIX}*`)).resolves.toEqual([]);
	});
});
