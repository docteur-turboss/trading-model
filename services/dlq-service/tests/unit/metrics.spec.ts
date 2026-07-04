import { describe, expect, it, jest } from "@jest/globals";

jest.mock("prom-client", () => {
	const mockMetric = {
		inc: jest.fn(),
		set: jest.fn(),
		observe: jest.fn(),
	};
	const MockRegistry = jest.fn(() => ({
		contentType: "text/plain",
		metrics: jest.fn(() => Promise.resolve("metrics data")),
	}));
	return {
		Registry: MockRegistry,
		collectDefaultMetrics: jest.fn(),
		Counter: jest.fn(() => ({ ...mockMetric, inc: jest.fn() })),
		Histogram: jest.fn(() => ({ ...mockMetric, observe: jest.fn() })),
		Gauge: jest.fn(() => ({ ...mockMetric, set: jest.fn() })),
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
		expect(metrics.entrySizeBytes).toBeDefined();
		expect(metrics.collectionSize).toBeDefined();
	});

	it("should export metricsHandler function", () => {
		const { metricsHandler } = require("../../src/config/metrics");
		expect(typeof metricsHandler).toBe("function");
	});

	it("metricsHandler should respond with metrics data", async () => {
		const { metricsHandler } = require("../../src/config/metrics");
		const res = {
			setHeader: jest.fn(),
			status: jest.fn(() => ({ end: jest.fn() })),
		};
		await metricsHandler(null, res);
		expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/plain");
	});
});
