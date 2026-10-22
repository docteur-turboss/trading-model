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
		const next = jest.fn() as NextFunction;

		void middleware(req, res, next);
		expect(next).toHaveBeenCalled();
	});

	it("should call next with error for unauthorized caller", () => {
		const middleware = MTLSAuthorizationMiddleware(ServiceId.of("api-gateway"));
		const req = {
			clientIdentity: "spiffe://cluster.local/ns/default/sa/unknown-service",
		} as unknown as Request;
		const res = {} as unknown as Response;
		const next = jest.fn() as NextFunction;

		void middleware(req, res, next);
		expect(next).toHaveBeenCalled();
	});
});
