import { describe, expect, it, jest } from "@jest/globals";

const mockMetricsFn = jest
	.fn<() => Promise<string>>()
	.mockResolvedValue("metrics data");

jest.mock("prom-client", () => ({
	collectDefaultMetrics: jest.fn<(...args: any[]) => any>(),
	Counter: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => ({ inc: jest.fn<(...args: any[]) => any>() })),
	Histogram: jest.fn<(...args: any[]) => any>().mockImplementation(() => ({
		observe: jest.fn<(...args: any[]) => any>(),
	})),
	Gauge: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => ({ set: jest.fn<(...args: any[]) => any>() })),
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
		const res = {
			set: jest.fn<(...args: any[]) => any>(),
			send: jest.fn<(...args: any[]) => any>(),
		} as any;
		metricsHandler({} as any, res, jest.fn<(...args: any[]) => any>());
		expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain");
		expect(mockMetricsFn).toHaveBeenCalled();
	});
});
