import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
		debug: jest.fn<(...args: any[]) => any>(),
	},
}));

const mockResolveMtlsIdentity = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/adapters/inbound/mtls-identity", () => ({
	resolveMtlsIdentity: mockResolveMtlsIdentity,
}));

import { REGISTRATION_MTLS_AUTH } from "../../src/adapters/inbound/registration-auth";

function mockResponse(): Response {
	const res = {
		status: jest.fn<(...args: any[]) => any>().mockReturnThis(),
		json: jest.fn<(...args: any[]) => any>().mockReturnThis(),
	} as unknown as Response;
	return res;
}

function callerIs(serviceName: string): void {
	mockResolveMtlsIdentity.mockReturnValue({
		serviceName,
		identity: `spiffe://trading-model.local/ns/trading-model/sa/${serviceName}`,
	});
}

function register(body: unknown): {
	res: Response;
	next: jest.Mock<(...args: any[]) => any>;
} {
	const req = { ip: "10.0.0.1", body } as Request;
	const res = mockResponse();
	const next = jest.fn<(...args: any[]) => any>();
	REGISTRATION_MTLS_AUTH(req, res, next);
	return { res, next };
}

describe("REGISTRATION_MTLS_AUTH", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("rejects a caller without an mTLS identity", () => {
		mockResolveMtlsIdentity.mockReturnValue(null);

		const { res, next } = register({ serviceName: "financial-scraper" });

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({
			error: "Client certificate required for registration",
		});
		expect(next).not.toHaveBeenCalled();
	});

	it("accepts a caller registering its own service", () => {
		callerIs("financial-scraper");

		const { res, next } = register({ serviceName: "financial-scraper" });

		expect(next).toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalled();
	});

	it("accepts a legacy alias of the caller's service name", () => {
		callerIs("financial-scraper");

		const { next } = register({ serviceName: "financial-scraper-service" });

		expect(next).toHaveBeenCalled();
	});

	it("rejects a caller registering another service", () => {
		callerIs("financial-scraper");

		const { res, next } = register({ serviceName: "trader-trainer" });

		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.json).toHaveBeenCalledWith({
			error: "Caller identity does not match the registered serviceName",
		});
		expect(next).not.toHaveBeenCalled();
	});

	it("rejects a body without a serviceName", () => {
		callerIs("financial-scraper");

		const { res, next } = register(undefined);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});
});
