import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import {
	DurationMs,
	InstanceId,
	toServiceId,
} from "@trading-model/primitives/primitives";
import Redis from "ioredis";
import { RedisServiceCache } from "../../src/adapters/outbound/discovery/redis-service-cache";

const PREFIX = "am-db-spec:";
const SERVICE = toServiceId("financial-scraper-service");
const redis = new Redis(process.env.TEST_REDIS_URL as string);
const caches: RedisServiceCache[] = [];

/** One cache per address-manager replica, all sharing the same Redis. */
function replica(ttlMs = 5000): RedisServiceCache {
	const cache = new RedisServiceCache({
		connection: process.env.TEST_REDIS_URL as string,
		prefix: PREFIX,
		ttlMs: DurationMs.of(ttlMs),
	});
	caches.push(cache);
	return cache;
}

function instance(instanceId: string): ServiceInstance {
	return {
		serviceName: SERVICE,
		instanceId,
		host: "10.0.0.1",
		port: 3000,
		protocol: "mtls",
		version: "1.0.0",
		ttl: 30_000,
		registeredAt: 1,
		lastHeartbeat: 2,
	} as unknown as ServiceInstance;
}

beforeEach(async () => {
	await redis.flushdb();
});

afterAll(async () => {
	for (const cache of caches) {
		cache.close();
	}
	await redis.quit();
});

describe("RedisServiceCache — real Redis", () => {
	it("should share a cached instance between replicas until its TTL expires", async () => {
		await replica(2000).set({
			serviceName: SERVICE,
			instance: instance("i-1"),
		});

		await expect(replica().get(SERVICE)).resolves.toMatchObject({
			instanceId: "i-1",
		});
		const ttl = await redis.pttl(`${PREFIX}${SERVICE}`);
		expect(ttl).toBeGreaterThan(0);
		expect(ttl).toBeLessThanOrEqual(2000);
	});

	it("should keep regional entries apart from the default one", async () => {
		const cache = replica();

		await cache.set({ serviceName: SERVICE, instance: instance("i-default") });
		await cache.set({
			serviceName: SERVICE,
			region: "eu-west",
			instance: instance("i-eu"),
		});

		await expect(cache.get(SERVICE)).resolves.toMatchObject({
			instanceId: "i-default",
		});
		await expect(cache.get(SERVICE, "eu-west")).resolves.toMatchObject({
			instanceId: "i-eu",
		});
		await cache.delete(SERVICE, "eu-west");
		await expect(cache.get(SERVICE, "eu-west")).resolves.toBeNull();
		await expect(cache.get(SERVICE)).resolves.not.toBeNull();
	});

	it("should list cached instances without the circuit states stored next to them", async () => {
		const cache = replica();
		await cache.set({ serviceName: SERVICE, instance: instance("i-default") });
		await cache.set({
			serviceName: SERVICE,
			region: "eu-west",
			instance: instance("i-eu"),
		});
		await cache.circuitStateStore.setCircuitState(InstanceId.of("i-default"), {
			failures: 3,
			lastFailureTime: 1,
			state: CircuitState.OPEN,
		} as never);

		const entries = await cache.entries();

		expect(
			entries.map((e) => [e.serviceName, e.region, e.instance.instanceId])
		).toEqual(
			expect.arrayContaining([
				[SERVICE, undefined, "i-default"],
				[SERVICE, "eu-west", "i-eu"],
			])
		);
		expect(entries).toHaveLength(2);
	});

	it("should let another replica see an open circuit, for twice the cache TTL", async () => {
		const state = {
			failures: 5,
			lastFailureTime: 1_700_000_000_000,
			state: CircuitState.OPEN,
		} as never;
		await replica(1000).circuitStateStore.setCircuitState(
			InstanceId.of("i-1"),
			state
		);

		await expect(
			replica().circuitStateStore.getCircuitState(InstanceId.of("i-1"))
		).resolves.toEqual(state);
		const ttl = await redis.pttl(`${PREFIX}circuit:i-1`);
		expect(ttl).toBeGreaterThan(1000);
		expect(ttl).toBeLessThanOrEqual(2000);

		await replica().circuitStateStore.deleteCircuitState(InstanceId.of("i-1"));
		await expect(
			replica().circuitStateStore.getCircuitState(InstanceId.of("i-1"))
		).resolves.toBeNull();
	});

	it("should clear every cached instance for all replicas, past a single SCAN page", async () => {
		const writer = replica();
		for (let i = 0; i < 450; i++) {
			await writer.set({
				serviceName: toServiceId(`svc-${i}`),
				region: i % 2 ? ("eu-west" as never) : undefined,
				instance: instance(`i-${i}`),
			});
		}
		await redis.set("other-prefix:svc-0", "kept");

		await replica().clear();

		await expect(writer.entries()).resolves.toEqual([]);
		await expect(writer.get(toServiceId("svc-0"))).resolves.toBeNull();
		await expect(redis.get("other-prefix:svc-0")).resolves.toBe("kept");
	});

	it("should keep the circuit states when the cache is cleared, like the in-memory cache", async () => {
		const cache = replica();
		const state = {
			failures: 5,
			lastFailureTime: 1,
			state: CircuitState.OPEN,
		} as never;
		await cache.set({ serviceName: SERVICE, instance: instance("i-1") });
		await cache.circuitStateStore.setCircuitState(InstanceId.of("i-1"), state);

		await cache.clear();

		await expect(cache.get(SERVICE)).resolves.toBeNull();
		await expect(
			replica().circuitStateStore.getCircuitState(InstanceId.of("i-1"))
		).resolves.toEqual(state);
	});
});
