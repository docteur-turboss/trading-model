import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type {
	Capability,
	InstanceId,
	IPAddress,
	Port,
} from "../../../src/domain/primitives";
import { PositiveInt } from "../../../src/domain/primitives";
import type { WorkerRegistry } from "../../../src/worker/worker-registry";
import { createWorkerRegistry } from "../../../src/worker/worker-registry";

describe("WorkerRegistry", () => {
	let registry: WorkerRegistry;

	beforeEach(() => {
		jest.useFakeTimers();
		registry = createWorkerRegistry(10000);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("register", () => {
		it("should add a worker to the registry", () => {
			registry.store.register("worker-1", {
				workerId: "worker-1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			expect(registry.store.size()).toBe(1);
		});
	});

	describe("unregister", () => {
		it("should remove a worker from the registry", () => {
			registry.store.register("worker-1", {
				workerId: "worker-1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});
			registry.store.unregister("worker-1");

			expect(registry.store.size()).toBe(0);
		});
	});

	describe("get", () => {
		it("should return undefined for unknown worker", () => {
			expect(registry.store.get("unknown")).toBeUndefined();
		});

		it("should return the worker registration", () => {
			registry.store.register("worker-1", {
				workerId: "worker-1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			const worker = registry.store.get("worker-1");
			expect(worker).toBeDefined();
			expect(worker!.status).toBe("active");
		});
	});

	describe("heartbeat", () => {
		it("should update lastHeartbeat for a registered worker", () => {
			registry.store.register("worker-1", {
				workerId: "worker-1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			const before = registry.store.get("worker-1")!.lastHeartbeat;
			jest.advanceTimersByTime(1000);
			registry.store.heartbeat("worker-1");
			const after = registry.store.get("worker-1")!.lastHeartbeat;

			expect(after).toBeGreaterThan(before);
		});

		it("should not fail for unknown worker", () => {
			expect(() => registry.store.heartbeat("unknown")).not.toThrow();
		});
	});

	describe("updateLoad", () => {
		it("should update the current load of a worker", () => {
			registry.store.register("worker-1", {
				workerId: "worker-1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			registry.store.updateLoad("worker-1", 3);
			expect(registry.store.get("worker-1")!.currentLoad).toBe(3);
		});

		it("should not throw for unknown worker", () => {
			expect(() => registry.store.updateLoad("unknown", 5)).not.toThrow();
		});
	});

	describe("setStatus", () => {
		it("should update the status of a worker", () => {
			registry.store.register("worker-1", {
				workerId: "worker-1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			registry.store.setStatus("worker-1", "draining");
			expect(registry.store.get("worker-1")!.status).toBe("draining");
		});

		it("should not throw for unknown worker", () => {
			expect(() =>
				registry.store.setStatus("unknown", "offline")
			).not.toThrow();
		});
	});

	describe("findBestWorker", () => {
		it("should return null when no workers are registered", () => {
			expect(registry.loadBalancer.findBestWorker("type-a")).toBeNull();
		});

		it("should return null when no worker supports the job type", () => {
			registry.store.register("worker-1", {
				workerId: "worker-1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-b" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			expect(registry.loadBalancer.findBestWorker("type-a")).toBeNull();
		});

		it("should skip draining workers", () => {
			registry.store.register("draining-worker", {
				workerId: "draining-worker" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});
			registry.store.setStatus("draining-worker", "draining");

			expect(registry.loadBalancer.findBestWorker("type-a")).toBeNull();
		});

		it("should skip workers at max concurrency", () => {
			registry.store.register("busy-worker", {
				workerId: "busy-worker" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(2),
				currentLoad: 2,
			});

			expect(registry.loadBalancer.findBestWorker("type-a")).toBeNull();
		});

		it("should return the least loaded compatible worker", () => {
			registry.store.register("busy", {
				workerId: "busy" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(10),
				currentLoad: 8,
			});
			registry.store.register("free", {
				workerId: "free" as unknown as InstanceId,
				host: "10.0.0.2" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(10),
				currentLoad: 2,
			});

			const best = registry.loadBalancer.findBestWorker("type-a");
			expect(best).not.toBeNull();
			expect(best!.workerId).toBe("free");
		});

		it("should skip workers with higher load than current best", () => {
			registry.store.register("good", {
				workerId: "good" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(10),
				currentLoad: 2,
			});
			registry.store.register("worse", {
				workerId: "worse" as unknown as InstanceId,
				host: "10.0.0.2" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(10),
				currentLoad: 5,
			});

			const best = registry.loadBalancer.findBestWorker("type-a");
			expect(best!.workerId).toBe("good");
		});
	});

	describe("purgeStaleWorkers", () => {
		it("should return empty array when all workers are active", () => {
			registry.store.register("worker-1", {
				workerId: "worker-1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});
			registry.store.heartbeat("worker-1");

			const stale = registry.healthMonitor.purgeStaleWorkers();
			expect(stale).toEqual([]);
		});

		it("should purge workers with expired heartbeats", () => {
			registry.store.register("worker-1", {
				workerId: "worker-1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: ["type-a" as unknown as Capability],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});

			jest.advanceTimersByTime(15000);

			const stale = registry.healthMonitor.purgeStaleWorkers();
			expect(stale).toContain("worker-1");
			expect(registry.store.size()).toBe(0);
		});
	});

	describe("size", () => {
		it("should return 0 for empty registry", () => {
			expect(registry.store.size()).toBe(0);
		});

		it("should return the number of registered workers", () => {
			registry.store.register("w1", {
				workerId: "w1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: [],
				maxConcurrency: PositiveInt.of(1),
				currentLoad: 0,
			});
			registry.store.register("w2", {
				workerId: "w2" as unknown as InstanceId,
				host: "10.0.0.2" as IPAddress,
				port: 9000 as Port,
				capabilities: [],
				maxConcurrency: PositiveInt.of(1),
				currentLoad: 0,
			});

			expect(registry.store.size()).toBe(2);
		});
	});

	describe("averageLoad", () => {
		it("should return 0 for empty registry", () => {
			expect(registry.healthMonitor.averageLoad()).toBe(0);
		});

		it("should calculate the average load ratio", () => {
			registry.store.register("w1", {
				workerId: "w1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: [],
				maxConcurrency: PositiveInt.of(10),
				currentLoad: 5,
			});
			registry.store.register("w2", {
				workerId: "w2" as unknown as InstanceId,
				host: "10.0.0.2" as IPAddress,
				port: 9000 as Port,
				capabilities: [],
				maxConcurrency: PositiveInt.of(10),
				currentLoad: 3,
			});

			expect(registry.healthMonitor.averageLoad()).toBeCloseTo(0.4, 5);
		});

		it("should handle worker with maxConcurrency of 0", () => {
			registry.store.register("w1", {
				workerId: "w1" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: [],
				maxConcurrency: PositiveInt.of(1),
				currentLoad: 0,
			});

			expect(registry.healthMonitor.averageLoad()).toBe(0);
		});
	});

	describe("getAllActive", () => {
		it("should return only active workers", () => {
			registry.store.register("active-w", {
				workerId: "active-w" as unknown as InstanceId,
				host: "10.0.0.1" as IPAddress,
				port: 9000 as Port,
				capabilities: [],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});
			registry.store.register("draining-w", {
				workerId: "draining-w" as unknown as InstanceId,
				host: "10.0.0.2" as IPAddress,
				port: 9000 as Port,
				capabilities: [],
				maxConcurrency: PositiveInt.of(5),
				currentLoad: 0,
			});
			registry.store.setStatus("draining-w", "draining");

			const active = registry.healthMonitor.getAllActive();
			expect(active).toHaveLength(1);
			expect(active[0].workerId).toBe("active-w");
		});
	});
});
