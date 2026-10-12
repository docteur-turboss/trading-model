import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Request, Response } from "express";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const mockResolveMtlsIdentity = jest.fn();
jest.mock("@trading-model/http/adapters/inbound/mtls-identity", () => ({
	resolveMtlsIdentity: mockResolveMtlsIdentity,
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		NODE_ENV: "development",
		REGISTRATION_TOKEN: undefined,
	},
}));

import {
	REGISTRATION_AUTH,
	REGISTRATION_MTLS_AUTH,
} from "../../src/adapters/inbound/registration-auth";

function mockResponse(): Response {
	const res = {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
	} as unknown as Response;
	return res;
}

describe("registration-auth", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("REGISTRATION_MTLS_AUTH", () => {
		it("should reject when mTLS identity is missing", () => {
			mockResolveMtlsIdentity.mockReturnValue(null);
			const req = { ip: "10.0.0.1" } as Request;
			const res = mockResponse();
			const next = jest.fn();

			REGISTRATION_MTLS_AUTH(req, res, next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({
				error: "Client certificate required for registration",
			});
			expect(next).not.toHaveBeenCalled();
		});

		it("should call next when mTLS identity is verified", () => {
			mockResolveMtlsIdentity.mockReturnValue({
				serviceName: { toString: () => "test-service" },
				identity: "spiffe://test",
			});
			const req = { ip: "10.0.0.1" } as Request;
			const res = mockResponse();
			const next = jest.fn();

			REGISTRATION_MTLS_AUTH(req, res, next);

			expect(next).toHaveBeenCalled();
		});
	});

	describe("REGISTRATION_AUTH", () => {
		it("should pass through when no token configured in non-production", () => {
			const req = { headers: {} } as Request;
			const res = mockResponse();
			const next = jest.fn();

			REGISTRATION_AUTH(req, res, next);

			expect(next).toHaveBeenCalled();
			expect(res.status).not.toHaveBeenCalled();
		});

		it("should reject invalid token", () => {
			const env = jest.requireMock("../../src/infrastructure/config/env") as {
				ENV: { REGISTRATION_TOKEN?: string; NODE_ENV: string };
			};
			env.ENV.REGISTRATION_TOKEN = "secret-token";

			const req = {
				headers: { "x-registration-token": "wrong" },
				ip: "10.0.0.1",
			} as unknown as Request;
			const res = mockResponse();
			const next = jest.fn();

			REGISTRATION_AUTH(req, res, next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({
				error: "Invalid registration token",
			});
			expect(next).not.toHaveBeenCalled();
		});

		it("should accept valid token", () => {
			const env = jest.requireMock("../../src/infrastructure/config/env") as {
				ENV: { REGISTRATION_TOKEN?: string; NODE_ENV: string };
			};
			env.ENV.REGISTRATION_TOKEN = "secret-token";

			const req = {
				headers: { "x-registration-token": "secret-token" },
				ip: "10.0.0.1",
			} as unknown as Request;
			const res = mockResponse();
			const next = jest.fn();

			REGISTRATION_AUTH(req, res, next);

			expect(next).toHaveBeenCalled();
		});
	});
});
