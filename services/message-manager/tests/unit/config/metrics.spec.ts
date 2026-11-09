import { describe, expect, it, jest } from "@jest/globals";

const mockMetricsFn = jest
	.fn<() => Promise<string>>()
	.mockResolvedValue("data");

jest.mock("prom-client", () => ({
	collectDefaultMetrics: jest.fn<(...args: any[]) => any>(),
	Counter: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => ({ inc: jest.fn<(...args: any[]) => any>() })),
	Histogram: jest.fn<(...args: any[]) => any>().mockImplementation(() => ({
		observe: jest.fn<(...args: any[]) => any>(),
	})),
	Gauge: jest.fn<(...args: any[]) => any>().mockImplementation(() => ({
		set: jest.fn<(...args: any[]) => any>(),
		inc: jest.fn<(...args: any[]) => any>(),
		dec: jest.fn<(...args: any[]) => any>(),
	})),
	register: { contentType: "text/plain", metrics: mockMetricsFn },
}));

import {
	CIRCUIT_BREAKER_STATE,
	DELIVERY_LATENCY_SECONDS,
	IN_FLIGHT_MESSAGES,
	MESSAGES_DELIVERED_TOTAL,
	MESSAGES_DLQ_ERROR_TOTAL,
	MESSAGES_DLQ_TOTAL,
	MESSAGES_PUBLISHED_TOTAL,
	metricsHandler,
	SUBSCRIBER_DELIVERY_CONCURRENCY,
	SUBSCRIPTION_COUNT,
} from "../../../src/config/metrics";

describe("metrics", () => {
	it("should export all counters", () => {
		expect(MESSAGES_PUBLISHED_TOTAL).toBeDefined();
		expect(MESSAGES_DELIVERED_TOTAL).toBeDefined();
		expect(MESSAGES_DLQ_TOTAL).toBeDefined();
		expect(MESSAGES_DLQ_ERROR_TOTAL).toBeDefined();
	});

	it("should export all histograms", () => {
		expect(DELIVERY_LATENCY_SECONDS).toBeDefined();
	});

	it("should export all gauges", () => {
		expect(SUBSCRIPTION_COUNT).toBeDefined();
		expect(CIRCUIT_BREAKER_STATE).toBeDefined();
		expect(IN_FLIGHT_MESSAGES).toBeDefined();
		expect(SUBSCRIBER_DELIVERY_CONCURRENCY).toBeDefined();
	});

	it("metricsHandler should set content type and return metrics", () => {
		const res = {
			set: jest.fn<(...args: any[]) => any>(),
			send: jest.fn<(...args: any[]) => any>(),
		} as any;
		metricsHandler({} as any, res);
		expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain");
		expect(mockMetricsFn).toHaveBeenCalled();
	});
});
