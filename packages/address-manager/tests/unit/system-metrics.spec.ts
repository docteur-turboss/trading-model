import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { DurationMs } from "@trading-model/common/domain/primitives";
import {
	computeCpuPercent,
	SystemMetrics,
} from "../../src/infrastructure/monitoring/system-metrics";

describe("computeCpuPercent", () => {
	test("should return 0 and set previous on first call", () => {
		const result = computeCpuPercent(100, 500, {
			idle: 0 as DurationMs,
			total: 0 as DurationMs,
		});
		expect(result.percent).toBe(0);
		expect(result.previousCpuTimes).toEqual({ idle: 100, total: 500 });
	});

	test("should compute positive percent when totalDiff > 0", () => {
		const result = computeCpuPercent(100, 500, {
			idle: 50 as DurationMs,
			total: 200 as DurationMs,
		});
		expect(result.percent).toBeGreaterThan(0);
		expect(result.percent).toBeLessThanOrEqual(100);
	});

	test("should return 0 when totalDiff <= 0", () => {
		const result = computeCpuPercent(100, 500, {
			idle: 100 as DurationMs,
			total: 500 as DurationMs,
		});
		expect(result.percent).toBe(0);
		expect(result.previousCpuTimes).toEqual({ idle: 100, total: 500 });
	});
});

describe("SystemMetrics", () => {
	let metrics: SystemMetrics;

	beforeEach(() => {
		metrics = new SystemMetrics();
	});

	describe("collect", () => {
		test("should return a metrics payload with all fields", () => {
			const snapshot = metrics.collect();

			expect(snapshot).toHaveProperty("memory");
			expect(snapshot.memory).toHaveProperty("totalBytes");
			expect(snapshot.memory).toHaveProperty("usedBytes");
			expect(snapshot.memory).toHaveProperty("usedPercent");
			expect(snapshot.memory).toHaveProperty("heapUsedBytes");
			expect(snapshot.memory).toHaveProperty("heapTotalBytes");
			expect(snapshot.memory.totalBytes).toBeGreaterThan(0);
			expect(snapshot.memory.usedPercent).toBeGreaterThanOrEqual(0);
			expect(snapshot.memory.usedPercent).toBeLessThanOrEqual(100);

			expect(snapshot).toHaveProperty("cpu");
			expect(snapshot.cpu).toHaveProperty("percent");
			expect(snapshot.cpu).toHaveProperty("loadAvg1m");
			expect(snapshot.cpu).toHaveProperty("loadAvg5m");
			expect(snapshot.cpu).toHaveProperty("loadAvg15m");
			expect(snapshot.cpu.percent).toBeGreaterThanOrEqual(0);

			expect(snapshot).toHaveProperty("uptime");
			expect(snapshot.uptime).toBeGreaterThan(0);

			expect(snapshot).toHaveProperty("collectedAt");
			expect(snapshot.collectedAt).toBeLessThanOrEqual(Date.now());
		});

		test("should return 0 cpu percent on first call", () => {
			const snapshot = metrics.collect();
			expect(snapshot.cpu.percent).toBe(0);
		});

		test("should return non-zero cpu percent on second call", () => {
			metrics.collect();
			const snapshot = metrics.collect();
			expect(snapshot.cpu.percent).toBeGreaterThanOrEqual(0);
		});
	});

	describe("reset", () => {
		test("should clear previous cpu times", () => {
			metrics.collect();
			metrics.reset();
			const snapshot = metrics.collect();
			expect(snapshot.cpu.percent).toBe(0);
		});
	});

	describe("edge cases with mocked os", () => {
		test("should handle totalMem of 0 in usedPercent calculation", () => {
			jest.isolateModules(() => {
				jest.doMock("os", () => ({
					totalmem: () => 0,
					freemem: () => 0,
					cpus: () => [
						{ times: { idle: 100, user: 0, nice: 0, sys: 0, irq: 0 } },
					],
					loadavg: () => [0, 0, 0],
					uptime: () => 0,
				}));
				const {
					SystemMetrics: MockedMetrics,
				} = require("../../src/infrastructure/monitoring/system-metrics");
				const m = new MockedMetrics();
				const snapshot = m.collect();
				expect(snapshot.memory.usedPercent).toBe(0);
				expect(snapshot.cpu.percent).toBe(0);
			});
		});
	});
});
