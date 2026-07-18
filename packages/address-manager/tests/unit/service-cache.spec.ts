import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CircuitState as CircuitStateEnum } from "@trading-model/common/domain/circuit-state";
import {
	DurationMs,
	IPAddress,
	Port,
	PositiveInt,
	toInstanceId,
	toServiceId,
	toVersion,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { Protocol } from "@trading-model/validation/contracts/service-registry.types";
import type { ServiceInstance } from "../../src/client/type";
import { ServiceCache } from "../../src/discovery/service-cache";

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		serviceName: toServiceId("svc"),
		instanceId: toInstanceId("i-1"),
		host: IPAddress.of("127.0.0.1"),
		port: Port.of(8080),
		version: toVersion("1.0.0"),
		ttl: DurationMs.of(30000),
		protocol: Protocol.Http,
		registeredAt: UnixTimestamp.now(),
		lastHeartbeat: UnixTimestamp.now(),
		...overrides,
	};
}

describe("ServiceCache", () => {
	let cache: ServiceCache;

	beforeEach(() => {
		cache = new ServiceCache(5000 as never);
	});

	it("should store and return instance", async () => {
		const inst = makeInstance();
		await cache.set({ serviceName: toServiceId("svc"), instance: inst });
		const result = await cache.get(toServiceId("svc"));
		expect(result).toEqual(inst);
	});

	it("should return null for unknown service", async () => {
		const result = await cache.get(toServiceId("unknown"));
		expect(result).toBeNull();
	});

	it("should return null for expired entry", async () => {
		jest.useFakeTimers();
		const inst = makeInstance();
		await cache.set({ serviceName: toServiceId("svc"), instance: inst });
		jest.advanceTimersByTime(6000);
		const result = await cache.get(toServiceId("svc"));
		expect(result).toBeNull();
		jest.useRealTimers();
	});

	it("should delete entry", async () => {
		const inst = makeInstance();
		await cache.set({ serviceName: toServiceId("svc"), instance: inst });
		await cache.delete(toServiceId("svc"));
		const result = await cache.get(toServiceId("svc"));
		expect(result).toBeNull();
	});

	it("should clear all entries", async () => {
		await cache.set({
			serviceName: toServiceId("svc"),
			instance: makeInstance(),
		});
		await cache.set({
			serviceName: toServiceId("svc2"),
			instance: makeInstance({
				serviceName: toServiceId("svc2"),
				instanceId: toInstanceId("i-2"),
			}),
		});
		await cache.clear();
		expect(await cache.get(toServiceId("svc"))).toBeNull();
		expect(await cache.get(toServiceId("svc2"))).toBeNull();
	});

	it("should return entries", async () => {
		await cache.set({
			serviceName: toServiceId("svc"),
			instance: makeInstance(),
		});
		const entries = await cache.entries();
		expect(entries).toHaveLength(1);
		expect(entries[0].serviceName).toBe("svc");
	});

	it("entries should skip expired entries", async () => {
		jest.useFakeTimers();
		await cache.set({
			serviceName: toServiceId("svc"),
			instance: makeInstance(),
		});
		jest.advanceTimersByTime(6000);
		const entries = await cache.entries();
		expect(entries).toHaveLength(0);
		jest.useRealTimers();
	});

	it("getVersion should return 0", async () => {
		const v = await cache.getVersion(toServiceId("svc"));
		expect(v).toBe(0);
	});

	it("close should clear cache", async () => {
		await cache.set({
			serviceName: toServiceId("svc"),
			instance: makeInstance(),
		});
		cache.close();
		const result = await cache.get(toServiceId("svc"));
		expect(result).toBeNull();
	});

	it("setCircuitState should store and return state", async () => {
		await cache.setCircuitState(toInstanceId("i-1"), {
			failures: PositiveInt.of(3),
			lastFailureTime: UnixTimestamp.of(1000),
			state: CircuitStateEnum.OPEN,
		});
		const result = await cache.getCircuitState(toInstanceId("i-1"));
		expect(result).toEqual({
			failures: PositiveInt.of(3),
			lastFailureTime: UnixTimestamp.of(1000),
			state: CircuitStateEnum.OPEN,
		});
	});

	it("getCircuitState should return null for unknown instance", async () => {
		const result = await cache.getCircuitState(toInstanceId("unknown"));
		expect(result).toBeNull();
	});

	it("deleteCircuitState should remove state", async () => {
		await cache.setCircuitState(toInstanceId("i-1"), {
			failures: PositiveInt.of(1),
			lastFailureTime: UnixTimestamp.of(0),
			state: CircuitStateEnum.CLOSED,
		});
		await cache.deleteCircuitState(toInstanceId("i-1"));
		const result = await cache.getCircuitState(toInstanceId("i-1"));
		expect(result).toBeNull();
	});
});
