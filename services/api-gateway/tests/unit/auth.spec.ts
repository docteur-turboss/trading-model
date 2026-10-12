import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createNext, createReq, createRes } from "../helpers/express";

jest.mock("@trading-model/http/adapters/inbound/catch-error", () => ({
	catchSync: (fn: any) => fn,
}));

jest.mock("@trading-model/http/adapters/inbound/response-exception", () => ({
	sendResponse: (data: any, status: number) => ({ status, data }),
}));

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		warn: jest.fn(),
		info: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		AUTH_TOKEN_HEADER: "x-api-key",
		AUTH_STRICT: true,
		AUTH_TOKENS: "valid-token-1,valid-token-2",
	},
}));

import { AUTH_MIDDLEWARE } from "../../src/adapters/inbound/auth";

describe("AUTH_MIDDLEWARE", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should reject missing token with 401", async () => {
		const result = await AUTH_MIDDLEWARE(
			createReq({ headers: {} }),
			createRes(),
			createNext
		);
		expect(result).toMatchObject({
			status: 401,
			data: { error: "Missing authentication token" },
		});
	});

	it("should reject invalid token with 401", async () => {
		const result = await AUTH_MIDDLEWARE(
			createReq({ headers: { "x-api-key": "invalid" } }),
			createRes(),
			createNext
		);
		expect(result).toMatchObject({
			status: 401,
			data: { error: "Invalid authentication token" },
		});
	});

	it("should accept valid token", async () => {
		const result = await AUTH_MIDDLEWARE(
			createReq({ headers: { "x-api-key": "valid-token-1" } }),
			createRes(),
			createNext
		);
		expect(result).toBeUndefined();
	});

	it("should accept valid token from authorization header", async () => {
		const result = await AUTH_MIDDLEWARE(
			createReq({ headers: { authorization: "valid-token-2" } }),
			createRes(),
			createNext
		);
		expect(result).toBeUndefined();
	});
});

describe("AUTH_MIDDLEWARE — strict mode", () => {
	const mockEnv = jest.mocked(
		require("../../src/infrastructure/config/env").ENV
	);

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return 503 when AUTH_STRICT=true and AUTH_TOKENS is empty", async () => {
		mockEnv.AUTH_STRICT = true;
		mockEnv.AUTH_TOKENS = "";

		const result = await AUTH_MIDDLEWARE(
			createReq({ headers: { "x-api-key": "any-token" } }),
			createRes(),
			createNext
		);
		expect(result).toMatchObject({
			status: 503,
			data: { error: "Server misconfiguration: no valid tokens configured" },
		});
	});

	it("should accept any token when AUTH_STRICT=false and AUTH_TOKENS is empty", async () => {
		mockEnv.AUTH_STRICT = false;
		mockEnv.AUTH_TOKENS = "";

		const result = await AUTH_MIDDLEWARE(
			createReq({ headers: { "x-api-key": "any-token" } }),
			createRes(),
			createNext
		);
		expect(result).toBeUndefined();
	});
});
