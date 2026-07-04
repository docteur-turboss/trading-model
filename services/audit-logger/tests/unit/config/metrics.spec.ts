import { describe, expect, it, jest } from "@jest/globals";

const mockMetricsFn = jest
	.fn<() => Promise<string>>()
	.mockResolvedValue("metrics data");

jest.mock("prom-client", () => ({
	collectDefaultMetrics: jest.fn(),
	Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
	Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn() })),
	Gauge: jest.fn().mockImplementation(() => ({ set: jest.fn() })),
	register: {
		contentType: "text/plain",
		metrics: mockMetricsFn,
	},
}));

import {
	BACKPRESSURE_RATIO,
	EVENTS_INGESTED_TOTAL,
	EVENTS_QUERY_DURATION_SECONDS,
	EVENTS_STORED_TOTAL,
	JOB_COUNT,
	LOGS_INGESTED_TOTAL,
	LOGS_STORED_TOTAL,
	metricsHandler,
	ORPHAN_JOBS_TOTAL,
	WORKER_COUNT,
} from "../../../src/config/metrics";

describe("metrics", () => {
	it("should export LOGS_INGESTED_TOTAL counter", () => {
		expect(LOGS_INGESTED_TOTAL).toBeDefined();
	});

	it("should export LOGS_STORED_TOTAL counter", () => {
		expect(LOGS_STORED_TOTAL).toBeDefined();
	});

	it("should export EVENTS_INGESTED_TOTAL counter", () => {
		expect(EVENTS_INGESTED_TOTAL).toBeDefined();
	});

	it("should export EVENTS_STORED_TOTAL counter", () => {
		expect(EVENTS_STORED_TOTAL).toBeDefined();
	});

	it("should export EVENTS_QUERY_DURATION_SECONDS histogram", () => {
		expect(EVENTS_QUERY_DURATION_SECONDS).toBeDefined();
	});

	it("should export JOB_COUNT gauge", () => {
		expect(JOB_COUNT).toBeDefined();
	});

	it("should export BACKPRESSURE_RATIO gauge", () => {
		expect(BACKPRESSURE_RATIO).toBeDefined();
	});

	it("should export WORKER_COUNT gauge", () => {
		expect(WORKER_COUNT).toBeDefined();
	});

	it("should export ORPHAN_JOBS_TOTAL counter", () => {
		expect(ORPHAN_JOBS_TOTAL).toBeDefined();
	});

	it("metricsHandler should set content type and return metrics", () => {
		const res = { set: jest.fn(), send: jest.fn() } as any;
		metricsHandler({} as any, res);
		expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain");
		expect(mockMetricsFn).toHaveBeenCalled();
	});
});
