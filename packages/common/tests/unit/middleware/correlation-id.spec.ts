import { describe, expect, it, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import { HTTP_HEADERS } from "../../../src/http-headers";
import { correlationIdMiddleware } from "../../../src/middleware/correlation-id";

describe("correlationIdMiddleware", () => {
	it("should generate a UUID when no header exists", () => {
		const req = { headers: {} } as Request;
		const res = { setHeader: jest.fn() } as unknown as Response;
		const next = jest.fn() as NextFunction;

		correlationIdMiddleware(req, res, next);

		expect(req.correlationId).toBeDefined();
		expect(typeof req.correlationId).toBe("string");
		expect(req.correlationId.length).toBeGreaterThan(0);
		expect(res.setHeader).toHaveBeenCalledWith(
			HTTP_HEADERS.CORRELATION_ID,
			req.correlationId
		);
		expect(next).toHaveBeenCalled();
	});

	it("should use existing correlation-id header", () => {
		const req = {
			headers: { [HTTP_HEADERS.CORRELATION_ID]: "existing-id" },
		} as unknown as Request;
		const res = { setHeader: jest.fn() } as unknown as Response;
		const next = jest.fn() as NextFunction;

		correlationIdMiddleware(req, res, next);

		expect(req.correlationId).toBe("existing-id");
		expect(res.setHeader).toHaveBeenCalledWith(
			HTTP_HEADERS.CORRELATION_ID,
			"existing-id"
		);
	});

	it("should use x-request-id as fallback header", () => {
		const req = {
			headers: { [HTTP_HEADERS.X_REQUEST_ID]: "req-123" },
		} as unknown as Request;
		const res = { setHeader: jest.fn() } as unknown as Response;
		const next = jest.fn() as NextFunction;

		correlationIdMiddleware(req, res, next);

		expect(req.correlationId).toBe("req-123");
	});
});
