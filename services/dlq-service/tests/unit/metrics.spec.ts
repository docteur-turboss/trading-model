import { describe, expect, it, jest } from "@jest/globals";

jest.mock("prom-client", () => {
	const mockMetric = {
		inc: jest.fn<(...args: any[]) => any>(),
		set: jest.fn<(...args: any[]) => any>(),
		observe: jest.fn<(...args: any[]) => any>(),
	};
	const MockRegistry = jest.fn((..._args: any[]) => ({
		contentType: "text/plain",
		metrics: jest.fn((..._args: any[]) => Promise.resolve("metrics data")),
	}));
	return {
		Registry: MockRegistry,
		register: {
			contentType: "text/plain",
			metrics: jest.fn((..._args: any[]) => Promise.resolve("metrics data")),
		},
		collectDefaultMetrics: jest.fn<(...args: any[]) => any>(),
		Counter: jest.fn((..._args: any[]) => ({
			...mockMetric,
			inc: jest.fn<(...args: any[]) => any>(),
		})),
		Histogram: jest.fn((..._args: any[]) => ({
			...mockMetric,
			observe: jest.fn<(...args: any[]) => any>(),
		})),
		Gauge: jest.fn((..._args: any[]) => ({
			...mockMetric,
			set: jest.fn<(...args: any[]) => any>(),
		})),
	};
});

describe("metrics", () => {
	it("should export metrics with all expected metric types", () => {
		const { metrics } = require("../../src/config/metrics");
		expect(metrics.entriesAdded).toBeDefined();
		expect(metrics.entriesDeleted).toBeDefined();
		expect(metrics.entriesReplayed).toBeDefined();
		expect(metrics.entriesReplayFailed).toBeDefined();
		expect(metrics.entriesPruned).toBeDefined();
		expect(metrics.pruneErrors).toBeDefined();
		expect(metrics.collectionSize).toBeDefined();
	});

	it("should export metricsHandler function", () => {
		const { metricsHandler } = require("../../src/config/metrics");
		expect(typeof metricsHandler).toBe("function");
	});

	it("metricsHandler should respond with metrics data", async () => {
		const { metricsHandler } = require("../../src/config/metrics");
		const res = {
			set: jest.fn<(...args: any[]) => any>(),
			send: jest.fn<(...args: any[]) => any>(),
		};
		metricsHandler(null, res);
		expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain");

		await new Promise((r) => setImmediate(r));

		expect(res.send).toHaveBeenCalledWith("metrics data");
	});
});
