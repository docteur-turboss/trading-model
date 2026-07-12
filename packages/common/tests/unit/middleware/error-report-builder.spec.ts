import { describe, expect, it } from "@jest/globals";
import type { Request } from "express";
import {
	DurationMs,
	PositiveInt,
	URLString,
} from "../../../src/domain/primitives";
import { HTTP_STATUS } from "../../../src/http-status";
import { buildErrorReport } from "../../../src/middleware/error-report-builder";

function mockRequest(overrides: Partial<Request> = {}): Request {
	return {
		originalUrl: "http://example.com/test",
		url: "http://example.com/test",
		method: "GET",
		correlationId: "corr-default",
		...overrides,
	} as unknown as Request;
}

describe("buildErrorReport", () => {
	const config = {
		serviceName: "my-service" as never,
		serviceVersion: "1.0.0" as never,
		instanceId: "i-123" as never,
		batchSize: PositiveInt.of(10),
		flushIntervalMs: DurationMs.of(5000),
		endpoint: URLString.of("http://endpoint"),
	};

	it("should build a report from an error", () => {
		const req = mockRequest();
		const report = buildErrorReport(
			new Error("test error"),
			req,
			HTTP_STATUS.INTERNAL_SERVER_ERROR,
			config
		);
		expect(report.message).toBe("test error");
		expect(report.method).toBe("GET");
		expect(report.url).toBe("http://example.com/test");
		expect(report.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
	});

	it("should include correlationId from request", () => {
		const req = mockRequest({ correlationId: "corr-abc" as never });
		const report = buildErrorReport(
			new Error("err"),
			req,
			HTTP_STATUS.INTERNAL_SERVER_ERROR,
			config
		);
		expect(report.correlationId).toBe("corr-abc");
	});

	it("should use req.url when originalUrl is not available", () => {
		const req = mockRequest({
			originalUrl: undefined as never,
			url: "https://fallback.com/path",
		});
		const report = buildErrorReport(
			new Error("err"),
			req,
			HTTP_STATUS.INTERNAL_SERVER_ERROR,
			config
		);
		expect(report.url).toBe("https://fallback.com/path");
	});
});
