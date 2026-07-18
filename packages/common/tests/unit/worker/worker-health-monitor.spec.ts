import { describe, expect, it, jest } from "@jest/globals";
import type { WorkerRegistration } from "@trading-model/validation/contracts/worker-protocol.types";
import type {
	PositiveInt,
	WorkerStatusCode,
} from "../../../src/domain/primitives";
import { WorkerHealthMonitor } from "../../../src/worker/worker-health-monitor";
import type { WorkerStore } from "../../../src/worker/worker-store";

function makeWorkerMap(
	workers: Record<string, Partial<WorkerRegistration>>
): Map<string, WorkerRegistration> {
	return new Map(
		Object.entries(workers).map(([k, v]) => [
			k,
			{
				currentLoad: 0,
				maxConcurrency: 1 as PositiveInt,
				status: "active" as WorkerStatusCode,
				lastHeartbeat: 0 as never,
				...v,
			},
		])
	);
}

function createMockStore(
	workers: Record<string, Partial<WorkerRegistration>>
): WorkerStore {
	const map = makeWorkerMap(workers);
	return {
		purgeStaleWorkers: jest.fn(() => []),
		size: jest.fn(() => Object.keys(workers).length),
		all: jest.fn(() => new Map(map)),
		values: jest.fn(() => map.values()),
	} as never;
}

describe("WorkerHealthMonitor", () => {
	it("should purge stale workers", () => {
		const purgeStaleWorkers = jest.fn(() => ["worker-1"]);
		const store = {
			purgeStaleWorkers,
			values: jest.fn(() => [][Symbol.iterator]()),
		} as never;
		const monitor = new WorkerHealthMonitor(store);
		const result = monitor.purgeStaleWorkers();
		expect(result).toEqual(["worker-1"]);
	});

	it("should return 0 average load when no workers", () => {
		const store = createMockStore({});
		const monitor = new WorkerHealthMonitor(store);
		expect(monitor.averageLoad()).toBe(0);
	});

	it("should calculate average load", () => {
		const store = createMockStore({
			w1: { currentLoad: 2, maxConcurrency: 10 as PositiveInt },
			w2: { currentLoad: 5, maxConcurrency: 10 as PositiveInt },
		});
		const monitor = new WorkerHealthMonitor(store);
		const expectedAverage = (0.2 + 0.5) / 2;
		expect(monitor.averageLoad()).toBeCloseTo(expectedAverage);
	});

	it("should skip workers with 0 maxConcurrency in average load", () => {
		const store = createMockStore({
			w1: { currentLoad: 5, maxConcurrency: 0 as PositiveInt },
		});
		const monitor = new WorkerHealthMonitor(store);
		expect(monitor.averageLoad()).toBe(0);
	});

	it("should get all active workers", () => {
		const store = createMockStore({
			w1: {
				currentLoad: 2,
				maxConcurrency: 10 as PositiveInt,
				status: "active" as WorkerStatusCode,
			},
			w2: {
				currentLoad: 0,
				maxConcurrency: 10 as PositiveInt,
				status: "offline" as WorkerStatusCode,
			},
		});
		const monitor = new WorkerHealthMonitor(store);
		const active = monitor.getAllActive();
		expect(active).toHaveLength(1);
		expect(active[0].currentLoad).toBe(2);
	});
});
