import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createNext, createReq, createRes } from "../helpers/express";

jest.mock("@trading-model/common/middleware/catch-error", () => ({
	catchSync: (fn: any) => fn,
}));

jest.mock("@trading-model/common/middleware/response-exception", () => ({
	sendResponse: (data: any, status: number) => ({ status, data }),
}));

jest.mock("../../src/config/env", () => ({
	ENV: {
		AUTH_TOKEN_HEADER: "x-api-key",
		AUTH_TOKENS: "valid-token-1,valid-token-2",
	},
}));

import { AUTH_MIDDLEWARE } from "../../src/core/auth";

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
