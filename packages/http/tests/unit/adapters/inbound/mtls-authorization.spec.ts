import { describe, expect, it, jest } from "@jest/globals";
import { MTLSAuthorizationMiddleware } from "@trading-model/http/adapters/inbound/mtls-authorization";
import { ServiceId } from "@trading-model/primitives/primitives";
import type { NextFunction, Request, Response } from "express";

describe("MTLSAuthorizationMiddleware", () => {
	it("should call next() for authorized caller with wildcard", () => {
		const middleware = MTLSAuthorizationMiddleware(
			ServiceId.of("audit-logger")
		);
		const req = {
			clientIdentity: "spiffe://cluster.local/ns/default/sa/any-service",
		} as unknown as Request;
		const res = {} as unknown as Response;
		const next = jest.fn<(...args: any[]) => any>() as NextFunction;

		void middleware(req, res, next);
		expect(next).toHaveBeenCalled();
	});

	it("should call next with error for unauthorized caller", () => {
		const middleware = MTLSAuthorizationMiddleware(ServiceId.of("api-gateway"));
		const req = {
			clientIdentity: "spiffe://cluster.local/ns/default/sa/unknown-service",
		} as unknown as Request;
		const res = {} as unknown as Response;
		const next = jest.fn<(...args: any[]) => any>() as NextFunction;

		void middleware(req, res, next);
		expect(next).toHaveBeenCalled();
	});

	describe("metrics scrape", () => {
		const PROMETHEUS =
			"spiffe://trading-model.local/ns/trading-model/sa/prometheus";

		const SELF =
			"spiffe://trading-model.local/ns/trading-model/sa/trader-trainer";
		const OTHER =
			"spiffe://trading-model.local/ns/trading-model/sa/financial-scraper";

		function run(
			method: string,
			path: string,
			clientIdentity = PROMETHEUS
		): NextFunction {
			const middleware = MTLSAuthorizationMiddleware(
				ServiceId.of("trader-trainer"),
				[ServiceId.of("message-manager")]
			);
			const req = { clientIdentity, method, path } as Request;
			const next = jest.fn<(...args: any[]) => any>() as NextFunction;
			void middleware(req, {} as Response, next);
			return next;
		}

		it("lets prometheus read GET /metrics on any service", () => {
			expect(run("GET", "/metrics")).toHaveBeenCalledWith();
		});

		it("still denies prometheus every other route", () => {
			const next = run("GET", "/training-status");
			expect(next).toHaveBeenCalledWith(expect.anything());
		});

		it("lets a service read its own GET /metrics (canary gate)", () => {
			expect(run("GET", "/metrics", SELF)).toHaveBeenCalledWith();
		});

		it("denies a service every other route of itself it is not allowed", () => {
			const next = run("GET", "/training-status", SELF);
			expect(next).toHaveBeenCalledWith(expect.anything());
		});

		it("denies another service the metrics", () => {
			const next = run("GET", "/metrics", OTHER);
			expect(next).toHaveBeenCalledWith(expect.anything());
		});
	});
});
