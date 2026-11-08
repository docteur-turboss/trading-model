import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

const MOCK_INC = jest.fn<(...args: any[]) => any>();
const MOCK_OBSERVE = jest.fn<(...args: any[]) => any>();
const MOCK_SET = jest.fn<(...args: any[]) => any>();
const MOCK_METRICS = jest
	.fn<(...args: any[]) => any>()
	.mockResolvedValue("mock_metrics 1");
const MOCK_CONTENT_TYPE = "text/plain; charset=utf-8";

jest.mock("prom-client", () => {
	const MockRegistry = jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => ({
			contentType: MOCK_CONTENT_TYPE,
			metrics: MOCK_METRICS,
		}));

	return {
		Registry: MockRegistry,
		register: {
			contentType: MOCK_CONTENT_TYPE,
			metrics: MOCK_METRICS,
		},
		collectDefaultMetrics: jest.fn<(...args: any[]) => any>(),
		Counter: jest
			.fn<(...args: any[]) => any>()
			.mockImplementation(() => ({ inc: MOCK_INC })),
		Histogram: jest
			.fn<(...args: any[]) => any>()
			.mockImplementation(() => ({ observe: MOCK_OBSERVE })),
		Gauge: jest
			.fn<(...args: any[]) => any>()
			.mockImplementation(() => ({ set: MOCK_SET })),
	};
});

import {
	incHeartbeatsTotal,
	incLeaseCleanupCycle,
	incOperationError,
	observeCleanupDuration,
	setRegisteredInstances,
	setRegisteredInstancesPerService,
} from "../../src/infrastructure/monitoring/metrics";

describe("metrics", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("observeCleanupDuration", () => {
		it("should observe cleanup duration without throwing", () => {
			expect(() => {
				observeCleanupDuration(42);
			}).not.toThrow();
			expect(MOCK_OBSERVE).toHaveBeenCalled();
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
