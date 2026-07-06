import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ServiceInstance } from "../../src/client/type";
import { ServiceCache } from "../../src/discovery/service-cache";
import type { IPAddress, Port } from "@trading-model/common/domain/primitives";

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		serviceName: "svc",
		instanceId: "i-1",
		ip: "127.0.0.1" as unknown as IPAddress,
		port: 8080 as unknown as Port,
		version: "1.0.0",
		ttl: 30000,
		protocol: "http",
		registeredAt: Date.now(),
		lastHeartbeat: Date.now(),
		...overrides,
	};
}

describe("ServiceCache", () => {
	let cache: ServiceCache;

	beforeEach(() => {
		cache = new ServiceCache(5000);
	});

	it("should store and return instance", async () => {
		const inst = makeInstance();
		await cache.set("svc", inst);
		const result = await cache.get("svc");
		expect(result).toEqual(inst);
	});

	it("should return null for unknown service", async () => {
		const result = await cache.get("unknown");
		expect(result).toBeNull();
	});

	it("should return null for expired entry", async () => {
		jest.useFakeTimers();
		const inst = makeInstance();
		await cache.set("svc", inst);
		jest.advanceTimersByTime(6000);
		const result = await cache.get("svc");
		expect(result).toBeNull();
		jest.useRealTimers();
	});

	it("should invalidate entry", async () => {
		const inst = makeInstance();
		await cache.set("svc", inst);
		await cache.invalidate("svc");
		const result = await cache.get("svc");
		expect(result).toBeNull();
	});

	it("should clear all entries", async () => {
		await cache.set("svc", makeInstance());
		await cache.set(
			"svc2",
			makeInstance({ serviceName: "svc2", instanceId: "i-2" })
		);
		await cache.clear();
		expect(await cache.get("svc")).toBeNull();
		expect(await cache.get("svc2")).toBeNull();
	});

	it("should return entries", async () => {
		await cache.set("svc", makeInstance());
		const entries = await cache.entries();
		expect(entries).toHaveLength(1);
		expect(entries[0].serviceName).toBe("svc");
	});

	it("entries should skip expired entries", async () => {
		jest.useFakeTimers();
		await cache.set("svc", makeInstance());
		jest.advanceTimersByTime(6000);
		const entries = await cache.entries();
		expect(entries).toHaveLength(0);
		jest.useRealTimers();
	});

	it("getVersion should return 0", async () => {
		const v = await cache.getVersion("svc");
		expect(v).toBe(0);
	});

	it("stop should clear cache", async () => {
		await cache.set("svc", makeInstance());
		cache.stop();
		const result = await cache.get("svc");
		expect(result).toBeNull();
	});

	it("setCircuitState should store and return state", async () => {
		await cache.setCircuitState("i-1", {
			failures: 3,
			lastFailureTime: 1000,
			state: "open",
		});
		const result = await cache.getCircuitState("i-1");
		expect(result).toEqual({
			failures: 3,
			lastFailureTime: 1000,
			state: "open",
		});
	});

	it("getCircuitState should return null for unknown instance", async () => {
		const result = await cache.getCircuitState("unknown");
		expect(result).toBeNull();
	});

	it("deleteCircuitState should remove state", async () => {
		await cache.setCircuitState("i-1", {
			failures: 1,
			lastFailureTime: 0,
			state: "closed",
		});
		await cache.deleteCircuitState("i-1");
		const result = await cache.getCircuitState("i-1");
		expect(result).toBeNull();
	});
});
