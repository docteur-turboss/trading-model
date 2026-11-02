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
	EVENTS_INGESTED_TOTAL,
	EVENTS_QUERY_DURATION_SECONDS,
	EVENTS_STORED_TOTAL,
	metricsHandler,
} from "../../../src/config/metrics";

describe("metrics", () => {
	it("should export EVENTS_INGESTED_TOTAL counter", () => {
		expect(EVENTS_INGESTED_TOTAL).toBeDefined();
	});

	it("should export EVENTS_STORED_TOTAL counter", () => {
		expect(EVENTS_STORED_TOTAL).toBeDefined();
	});

	it("should export EVENTS_QUERY_DURATION_SECONDS histogram", () => {
		expect(EVENTS_QUERY_DURATION_SECONDS).toBeDefined();
	});

	it("metricsHandler should set content type and return metrics", () => {
		const res = { set: jest.fn(), send: jest.fn() } as any;
		metricsHandler({} as any, res);
		expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain");
		expect(mockMetricsFn).toHaveBeenCalled();
	});
});
