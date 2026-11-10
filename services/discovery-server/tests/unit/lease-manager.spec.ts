import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { LoggerPort } from "@trading-model/contracts/logger-registry";
import type { Protocol } from "@trading-model/contracts/service-registry-types";
import type {
	DurationMs,
	InstanceId,
	IPAddress,
	Port,
	ServiceId,
	UnixTimestamp,
	Version,
} from "@trading-model/primitives/primitives";
import type { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import type { ServiceInstance } from "../../src/shared/types";

jest.useFakeTimers();

import { InstanceStore } from "../../src/adapters/outbound/instance-store";
import { createServiceRegistry } from "../../src/config/container";
import { isAliveInstance } from "../../src/domain/expiration";
import { LeaseManager } from "../../src/domain/lease-manager";
import { validServiceInstance } from "../fixtures/index";

function makeLogger(): LoggerPort {
	return {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	};
}

describe("LeaseManager", () => {
	let leaseManager: LeaseManager;
	let logger: LoggerPort;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.clearAllTimers();
		logger = makeLogger();
		leaseManager = new LeaseManager(createServiceRegistry(), { logger });
	});

	afterEach(() => {
		jest.clearAllMocks();
		leaseManager.stop();
	});

	describe("instance gauges", () => {
		it("should report an instance removed by another replica after one cycle", async () => {
			const instanceStore = new InstanceStore();
			const setRegisteredInstancesPerService = jest.fn();
			const replicaA = createServiceRegistry({
				instanceStore,
				metrics: {
					setRegisteredInstances: jest.fn(),
					setRegisteredInstancesPerService,
				},
			});
			const replicaB = createServiceRegistry({ instanceStore });
			await replicaA.registerInstance(validServiceInstance());
			await replicaB.removeInstance({
				serviceName: "financial-scraper-service",
				instanceId: "test-instance-1",
			} as never);
			setRegisteredInstancesPerService.mockClear();
			const manager = new LeaseManager(replicaA, {
				logger,
				cleanupIntervalMs: 1000,
			});

			manager.start();
			await jest.advanceTimersByTimeAsync(2000);
			manager.stop();

			expect(setRegisteredInstancesPerService).toHaveBeenCalledWith(
				"financial-scraper",
				0
			);
		});
	});

	describe("start", () => {
		it("should start an interval after the initial delay", () => {
			const spy = jest.spyOn(global, "setInterval");
			leaseManager.start();
			expect(spy).not.toHaveBeenCalled();
			jest.advanceTimersByTime(5000);
			expect(spy).toHaveBeenCalledTimes(1);
			expect(spy).toHaveBeenCalledWith(expect.any(Function), 5000);
			spy.mockRestore();
		});

		it("should be idempotent", () => {
			const spy = jest.spyOn(global, "setInterval");
			leaseManager.start();
			leaseManager.start();
			jest.advanceTimersByTime(5000);
			expect(spy).toHaveBeenCalledTimes(1);
			spy.mockRestore();
		});
	});

	describe("stop", () => {
		it("should clear the interval", () => {
			const spy = jest.spyOn(global, "clearInterval");
			leaseManager.start();
			jest.advanceTimersByTime(5000);
			leaseManager.stop();
			expect(spy).toHaveBeenCalled();
			spy.mockRestore();
		});

		it("should be idempotent when not started", () => {
			expect(() => leaseManager.stop()).not.toThrow();
		});
	});

	describe("isAliveInstance", () => {
		it("should return true for recent heartbeat", () => {
			const instance: ServiceInstance = {
				serviceName: "test" as ServiceId,
				instanceId: "i1" as InstanceId,
				host: "1.1.1.1" as IPAddress,
				port: 8080 as Port,
				ttl: 30000 as DurationMs,
				protocol: "mtls" as unknown as Protocol,
				version: "1.0.0" as Version,
				registeredAt: (Date.now() - 1000) as UnixTimestamp,
				lastHeartbeat: Date.now() as UnixTimestamp,
			};
			expect(isAliveInstance(instance)).toBe(true);
		});

		it("should return false for expired heartbeat", () => {
			const instance: ServiceInstance = {
				serviceName: "test" as ServiceId,
				instanceId: "i1" as InstanceId,
				host: "1.1.1.1" as IPAddress,
				port: 8080 as Port,
				ttl: 30000 as DurationMs,
				protocol: "mtls" as unknown as Protocol,
				version: "1.0.0" as Version,
				registeredAt: (Date.now() - 120_000) as UnixTimestamp,
				lastHeartbeat: (Date.now() - 60_000) as UnixTimestamp,
			};
			expect(isAliveInstance(instance)).toBe(false);
		});

		it("should return true at TTL boundary", () => {
			const instance: ServiceInstance = {
				serviceName: "test" as ServiceId,
				instanceId: "i1" as InstanceId,
				host: "1.1.1.1" as IPAddress,
				port: 8080 as Port,
				ttl: 30000 as DurationMs,
				protocol: "mtls" as unknown as Protocol,
				version: "1.0.0" as Version,
				registeredAt: (Date.now() - 60_000) as UnixTimestamp,
				lastHeartbeat: (Date.now() - 30_000) as UnixTimestamp,
			};
			expect(isAliveInstance(instance)).toBe(true);
		});
	});

	describe("cleanup", () => {
		it("should remove expired instances on interval tick", async () => {
			const registry = createServiceRegistry();

			await registry.registerInstance({
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "expired-id" as InstanceId,
				host: "1.1.1.1" as IPAddress,
				port: 8080 as Port,
				ttl: 1 as DurationMs,
				protocol: "mtls" as unknown as Protocol,
				version: "1.0.0" as Version,
				registeredAt: Date.now() as UnixTimestamp,
				lastHeartbeat: Date.now() as UnixTimestamp,
			});

			await registry.registerInstance({
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "alive-id" as InstanceId,
				host: "1.1.1.2" as IPAddress,
				port: 8081 as Port,
				ttl: 60000 as DurationMs,
				protocol: "mtls" as unknown as Protocol,
				version: "1.0.0" as Version,
				registeredAt: Date.now() as UnixTimestamp,
				lastHeartbeat: Date.now() as UnixTimestamp,
			});

			const lm = new LeaseManager(registry);
			lm.start();
			await jest.advanceTimersByTimeAsync(10000);

			const remaining = await registry.instanceStore.getInstances(
				"financial-scraper-service" as unknown as ServiceInstanceName
			);
			expect(remaining).toHaveLength(1);
			expect(remaining[0].instanceId).toBe("alive-id");
		});

		it("should log error when removeInstance throws", async () => {
			const registry = createServiceRegistry();
			const lm = new LeaseManager(registry, { logger });

			await registry.registerInstance({
				serviceName: "trader-trainer" as ServiceId,
				instanceId: "test-id" as InstanceId,
				host: "1.1.1.1" as IPAddress,
				port: 8080 as Port,
				ttl: 1 as DurationMs,
				protocol: "mtls" as unknown as Protocol,
				version: "1.0.0" as Version,
				registeredAt: Date.now() as UnixTimestamp,
				lastHeartbeat: Date.now() as UnixTimestamp,
			});

			jest.spyOn(registry, "removeInstance").mockImplementation(() => {
				throw new Error("remove failed");
			});

			lm.start();
			await jest.advanceTimersByTimeAsync(10000);

			expect(logger.error).toHaveBeenCalledWith(
				"Redis cleanup error",
				expect.objectContaining({ error: expect.anything() })
			);
		});

		it("should log error when listServiceNames throws", async () => {
			const registry = createServiceRegistry();
			const lm = new LeaseManager(registry, { logger });

			jest
				.spyOn(registry.instanceStore, "listServiceNames")
				.mockImplementation(() => {
					throw new Error("unexpected error");
				});

			lm.start();
			await jest.advanceTimersByTimeAsync(10000);

			expect(logger.error).toHaveBeenCalledWith(
				"Redis cleanup error",
				expect.objectContaining({ error: expect.anything() })
			);
		});
	});
});
