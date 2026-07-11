import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const MOCK_INC = jest.fn();
const MOCK_OBSERVE = jest.fn();
const MOCK_SET = jest.fn();
const MOCK_METRICS = jest.fn().mockResolvedValue("mock_metrics 1");
const MOCK_CONTENT_TYPE = "text/plain; charset=utf-8";

jest.mock("prom-client", () => {
	const MockRegistry = jest.fn().mockImplementation(() => ({
		contentType: MOCK_CONTENT_TYPE,
		metrics: MOCK_METRICS,
	}));

	return {
		Registry: MockRegistry,
		collectDefaultMetrics: jest.fn(),
		Counter: jest.fn().mockImplementation(() => ({ inc: MOCK_INC })),
		Histogram: jest.fn().mockImplementation(() => ({ observe: MOCK_OBSERVE })),
		Gauge: jest.fn().mockImplementation(() => ({ set: MOCK_SET })),
	};
});

import type { Request, Response } from "express";
import {
	incCacheInvalidations,
	incHeartbeatsTotal,
	incLeaseCleanupCycle,
	incOperationError,
	incWsDroppedMessages,
	METRICS_HANDLER,
	observeCleanupDuration,
	setActiveWsConnections,
	setRegisteredInstances,
	setRegisteredInstancesPerService,
	trackRequest,
} from "../../src/monitoring/metrics";

describe("metrics", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("trackRequest", () => {
		it("should track request metrics without throwing", () => {
			expect(() => {
				trackRequest({
					method: "GET",
					path: "/test",
					status: 200,
					durationMs: 10,
				});
			}).not.toThrow();
			expect(MOCK_INC).toHaveBeenCalledWith({
				method: "GET",
				path: "/test",
				status: 200,
			});
		});

		it("should handle error status codes", () => {
			expect(() => {
				trackRequest({
					method: "POST",
					path: "/register",
					status: 500,
					durationMs: 50,
				});
			}).not.toThrow();
		});
	});

	describe("observeCleanupDuration", () => {
		it("should observe cleanup duration without throwing", () => {
			expect(() => {
				observeCleanupDuration(42);
			}).not.toThrow();
			expect(MOCK_OBSERVE).toHaveBeenCalled();
		});
	});

	describe("setActiveWsConnections", () => {
		it("should set WebSocket connection count without throwing", () => {
			expect(() => {
				setActiveWsConnections(5);
			}).not.toThrow();
			expect(MOCK_SET).toHaveBeenCalledWith(5);
		});
	});

	describe("METRICS_HANDLER", () => {
		it("should be a function", () => {
			expect(typeof METRICS_HANDLER).toBe("function");
		});

		it("should return Prometheus metrics content type", async () => {
			const req = {} as Request;
			const res = {
				setHeader: jest.fn(),
				end: jest.fn(),
			} as unknown as Response;

			await METRICS_HANDLER(req, res);

			expect(res.setHeader).toHaveBeenCalledWith(
				"Content-Type",
				expect.stringContaining("text/plain")
			);
			expect(res.end).toHaveBeenCalledWith("mock_metrics 1");
		});
	});

	describe("setRegisteredInstances", () => {
		it("should set registered instances gauge without throwing", () => {
			expect(() => {
				setRegisteredInstances(10);
			}).not.toThrow();
			expect(MOCK_SET).toHaveBeenCalledWith(10);
		});
	});

	describe("setRegisteredInstancesPerService", () => {
		it("should set per-service gauge without throwing", () => {
			expect(() => {
				setRegisteredInstancesPerService("financial-scraper-service", 5);
			}).not.toThrow();
			expect(MOCK_SET).toHaveBeenCalledWith(
				{ service: "financial-scraper-service" },
				5
			);
		});
	});

	describe("incHeartbeatsTotal", () => {
		it("should increment heartbeat counter without throwing", () => {
			expect(() => {
				incHeartbeatsTotal("financial-scraper-service");
			}).not.toThrow();
			expect(MOCK_INC).toHaveBeenCalledWith({
				service: "financial-scraper-service",
			});
		});
	});

	describe("incCacheInvalidations", () => {
		it("should increment cache invalidation counter without throwing", () => {
			expect(() => {
				incCacheInvalidations();
			}).not.toThrow();
			expect(MOCK_INC).toHaveBeenCalledWith();
		});
	});

	describe("incWsDroppedMessages", () => {
		it("should increment WS dropped messages counter without throwing", () => {
			expect(() => {
				incWsDroppedMessages();
			}).not.toThrow();
			expect(MOCK_INC).toHaveBeenCalledWith();
		});
	});

	describe("incOperationError", () => {
		it("should increment operation error counter without throwing", () => {
			expect(() => {
				incOperationError("register");
			}).not.toThrow();
			expect(MOCK_INC).toHaveBeenCalledWith({ operation: "register" });
		});
	});

	describe("incLeaseCleanupCycle", () => {
		it("should increment lease cleanup cycle counter without throwing", () => {
			expect(() => {
				incLeaseCleanupCycle();
			}).not.toThrow();
			expect(MOCK_INC).toHaveBeenCalledWith();
		});
	});
});
