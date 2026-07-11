import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { Request, Response } from "express";
import { HTTP_STATUS } from "../../../src/http-status";
import {
	configureErrorTracking,
	errorTrackingMiddleware,
	reportError,
	shutdownErrorTracking,
} from "../../../src/middleware/error-tracking";

describe("error-tracking", () => {
	beforeAll(() => {
		jest
			.spyOn(globalThis as any, "fetch")
			.mockResolvedValue({ ok: true } as never);
	});

	afterAll(() => {
		jest.restoreAllMocks();
	});

	beforeEach(() => {
		shutdownErrorTracking();
	});

	describe("configureErrorTracking", () => {
		it("should configure with an endpoint", () => {
			configureErrorTracking({ endpoint: "http://test-endpoint" as never });
		});

		it("should configure without an endpoint", () => {
			configureErrorTracking({});
		});
	});

	describe("reportError", () => {
		it("should silently skip when error tracking is not configured", () => {
			expect(() =>
				reportError(
					new Error("test"),
					{} as Request,
					HTTP_STATUS.INTERNAL_SERVER_ERROR
				)
			).not.toThrow();
		});

		it("should report when configured", () => {
			configureErrorTracking({
				endpoint: "http://test-endpoint" as never,
				serviceName: "svc" as never,
				instanceId: "i-1" as never,
				serviceVersion: "1.0.0" as never,
			});
			expect(() =>
				reportError(
					new Error("test"),
					{
						method: "GET",
						originalUrl: "http://example.com/test",
						url: "http://example.com/test",
						correlationId: "corr-1",
					} as Request,
					HTTP_STATUS.INTERNAL_SERVER_ERROR
				)
			).not.toThrow();
		});
	});

	describe("errorTrackingMiddleware", () => {
		it("should return a middleware function", () => {
			const middleware = errorTrackingMiddleware();
			expect(typeof middleware).toBe("function");
		});

		it("should return a middleware that calls next on non-server errors", () => {
			const middleware = errorTrackingMiddleware();
			const next = jest.fn<(...args: never[]) => void>();
			const res = { statusCode: 400 } as unknown as Response;
			middleware(
				new Error("bad request"),
				{
					originalUrl: "http://example.com/test",
					url: "http://example.com/test",
					correlationId: "corr-1",
				} as Request,
				res,
				next as never
			);
			expect(next).toHaveBeenCalled();
		});

		it("should return a middleware configured with endpoint", () => {
			const middleware = errorTrackingMiddleware("http://endpoint" as never);
			const next = jest.fn<(...args: never[]) => void>();
			middleware(
				new Error("err"),
				{
					originalUrl: "http://example.com/test",
					url: "http://example.com/test",
					correlationId: "corr-1",
				} as Request,
				{
					statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
				} as unknown as Response,
				next as never
			);
			expect(next).toHaveBeenCalled();
		});
	});

	describe("shutdownErrorTracking", () => {
		it("should shutdown without error when not configured", () => {
			expect(() => shutdownErrorTracking()).not.toThrow();
		});

		it("should shutdown after configuration", () => {
			configureErrorTracking({
				endpoint: "http://test" as never,
				serviceName: "svc" as never,
				instanceId: "i-1" as never,
				serviceVersion: "1.0.0" as never,
			});
			expect(() => shutdownErrorTracking()).not.toThrow();
		});
	});
});
