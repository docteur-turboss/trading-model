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
	BACKPRESSURE_RATIO,
	BUFFER_DROPPED_TOTAL,
	CIRCUIT_BREAKER_STATE,
	DELIVERY_LATENCY_SECONDS,
	DLQ_BUFFER_SIZE,
	IN_FLIGHT_MESSAGES,
	MESSAGES_DELIVERED_TOTAL,
	MESSAGES_DLQ_ERROR_TOTAL,
	MESSAGES_DLQ_TOTAL,
	MESSAGES_PUBLISHED_TOTAL,
	metricsHandler,
	REDIS_STREAM_LAG,
	REDIS_STREAM_SIZE,
	SUBSCRIBER_DELIVERY_CONCURRENCY,
	SUBSCRIPTION_COUNT,
	WSS_CONNECTION_COUNT,
} from "../../../src/config/metrics";

describe("metrics", () => {
	it("should export all counters", () => {
		expect(MESSAGES_PUBLISHED_TOTAL).toBeDefined();
		expect(MESSAGES_DELIVERED_TOTAL).toBeDefined();
		expect(MESSAGES_DLQ_TOTAL).toBeDefined();
		expect(MESSAGES_DLQ_ERROR_TOTAL).toBeDefined();
		expect(BUFFER_DROPPED_TOTAL).toBeDefined();
	});

	it("should export all histograms", () => {
		expect(DELIVERY_LATENCY_SECONDS).toBeDefined();
	});

	it("should export all gauges", () => {
		expect(SUBSCRIPTION_COUNT).toBeDefined();
		expect(CIRCUIT_BREAKER_STATE).toBeDefined();
		expect(REDIS_STREAM_SIZE).toBeDefined();
		expect(IN_FLIGHT_MESSAGES).toBeDefined();
		expect(BACKPRESSURE_RATIO).toBeDefined();
		expect(WSS_CONNECTION_COUNT).toBeDefined();
		expect(SUBSCRIBER_DELIVERY_CONCURRENCY).toBeDefined();
		expect(REDIS_STREAM_LAG).toBeDefined();
		expect(DLQ_BUFFER_SIZE).toBeDefined();
	});

	it("metricsHandler should set content type and return metrics", () => {
		const res = { set: jest.fn(), send: jest.fn() } as any;
		metricsHandler({} as any, res);
		expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain");
		expect(mockMetricsFn).toHaveBeenCalled();
	});
});
