import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";

const mockMetricsFn = jest
	.fn<() => Promise<string>>()
	.mockResolvedValue("prometheus data");

jest.mock("prom-client", () => ({
	collectDefaultMetrics: jest.fn(),
	Counter: jest.fn().mockImplementation(() => ({ inc: jest.fn() })),
	Histogram: jest.fn().mockImplementation(() => ({ observe: jest.fn() })),
	Gauge: jest.fn().mockImplementation(() => ({
		set: jest.fn(),
		inc: jest.fn(),
		dec: jest.fn(),
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
	HTTP_REQUEST_DURATION_SECONDS,
	HTTP_REQUESTS_TOTAL,
	metricsHandler,
	PROXY_REQUEST_DURATION_SECONDS,
	SERVICE_ERRORS_TOTAL,
} from "../../src/config/metrics";

describe("metrics", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should export HTTP_REQUESTS_TOTAL counter", () => {
		expect(HTTP_REQUESTS_TOTAL).toBeDefined();
		expect(typeof HTTP_REQUESTS_TOTAL).toBe("object");
	});

	it("should export HTTP_REQUEST_DURATION_SECONDS histogram", () => {
		expect(HTTP_REQUEST_DURATION_SECONDS).toBeDefined();
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
			set: jest.fn(),
			send: jest.fn(),
		} as unknown as Response;

		metricsHandler({} as Request, res);

		expect(res.set).toHaveBeenCalledWith("Content-Type", "text/plain");
		expect(mockMetricsFn).toHaveBeenCalled();
	});
});
