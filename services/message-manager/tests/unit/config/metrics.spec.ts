import { describe, expect, it, jest } from "@jest/globals";

const mockMetricsFn = jest
	.fn<() => Promise<string>>()
	.mockResolvedValue("data");

jest.mock("prom-client", () => ({
	collectDefaultMetrics: jest.fn(),
	Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
	Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn() })),
	Gauge: jest.fn().mockImplementation(() => ({
		set: jest.fn(),
		inc: jest.fn(),
		dec: jest.fn(),
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
		const res = { set: jest.fn(), send: jest.fn() } as any;
		metricsHandler({} as any, res);
		expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain");
		expect(mockMetricsFn).toHaveBeenCalled();
	});
});
