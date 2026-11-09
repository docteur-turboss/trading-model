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

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		NODE_ENV: "development",
		ALLOWED_REGISTRATION_CIDRS: "10.0.0.0/8,127.0.0.0/8",
	},
}));

import { REGISTRATION_IP_ALLOWLIST } from "../../src/adapters/inbound/registration-ip-allowlist";

function mockResponse(): Response {
	const res = {
		status: jest.fn<(...args: any[]) => any>().mockReturnThis(),
		json: jest.fn<(...args: any[]) => any>().mockReturnThis(),
	} as unknown as Response;
	return res;
}

describe("registration-ip-allowlist", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should reject when client IP is not in allowed ranges", () => {
		const req = {
			ip: "203.0.113.10",
			socket: { remoteAddress: "203.0.113.10" },
		} as unknown as Request;
		const res = mockResponse();
		const next = jest.fn<(...args: any[]) => any>();

		REGISTRATION_IP_ALLOWLIST(req, res, next);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});

	it("should accept when client IP is in allowed ranges", () => {
		const req = {
			ip: "10.1.2.3",
			socket: { remoteAddress: "10.1.2.3" },
		} as unknown as Request;
		const res = mockResponse();
		const next = jest.fn<(...args: any[]) => any>();

		REGISTRATION_IP_ALLOWLIST(req, res, next);

		expect(next).toHaveBeenCalled();
	});

	it("should handle IPv4-mapped IPv6 addresses", () => {
		const req = {
			ip: "::ffff:10.1.2.3",
			socket: { remoteAddress: "::ffff:10.1.2.3" },
		} as unknown as Request;
		const res = mockResponse();
		const next = jest.fn<(...args: any[]) => any>();

		REGISTRATION_IP_ALLOWLIST(req, res, next);

		expect(next).toHaveBeenCalled();
	});

	it("should reject when no IP can be determined", () => {
		const req = {
			ip: undefined,
			socket: { remoteAddress: undefined },
		} as unknown as Request;
		const res = mockResponse();
		const next = jest.fn<(...args: any[]) => any>();

		REGISTRATION_IP_ALLOWLIST(req, res, next);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(next).not.toHaveBeenCalled();
	});
});
