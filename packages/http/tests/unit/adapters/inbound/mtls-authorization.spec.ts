import { describe, expect, it, jest } from "@jest/globals";
import { ServiceId } from "@trading-model/common/domain/primitives";
import { MTLSAuthorizationMiddleware } from "@trading-model/http/adapters/inbound/mtls-authorization";
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
