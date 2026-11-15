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

import { metricsHandler } from "../../src/infrastructure/config/metrics";

describe("metrics", () => {
	beforeEach(() => {
		jest.clearAllMocks();
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
