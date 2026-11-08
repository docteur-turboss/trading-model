import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";

const mockMetricsFn = jest
	.fn<() => Promise<string>>()
	.mockResolvedValue("prometheus data");

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
	register: {
		contentType: "text/plain",
		metrics: mockMetricsFn,
	},
}));

import {
	ACTIVE_REQUESTS,
	AUTH_FAILURES_TOTAL,
	CACHE_HIT_RATIO,
	CACHE_SIZE,
	metricsHandler,
	PROXY_REQUEST_DURATION_SECONDS,
	SERVICE_ERRORS_TOTAL,
} from "../../src/infrastructure/config/metrics";

describe("metrics", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should export PROXY_REQUEST_DURATION_SECONDS histogram", () => {
		expect(PROXY_REQUEST_DURATION_SECONDS).toBeDefined();
	});

	it("should export CACHE_HIT_RATIO gauge", () => {
		expect(CACHE_HIT_RATIO).toBeDefined();
	});

	it("should export CACHE_SIZE gauge", () => {
		expect(CACHE_SIZE).toBeDefined();
	});

	it("should export AUTH_FAILURES_TOTAL counter", () => {
		expect(AUTH_FAILURES_TOTAL).toBeDefined();
	});

	it("should export SERVICE_ERRORS_TOTAL counter", () => {
		expect(SERVICE_ERRORS_TOTAL).toBeDefined();
	});

	it("should export ACTIVE_REQUESTS gauge", () => {
		expect(ACTIVE_REQUESTS).toBeDefined();
	});

	it("metricsHandler should set content type and send metrics", () => {
		const res = {
			set: jest.fn<(...args: any[]) => any>(),
			send: jest.fn<(...args: any[]) => any>(),
		} as unknown as Response;

		metricsHandler({} as Request, res, jest.fn<(...args: any[]) => any>());

		expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain");
		expect(mockMetricsFn).toHaveBeenCalled();
	});
});
