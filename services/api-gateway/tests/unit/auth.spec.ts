import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createNext, createReq, createRes } from "../helpers/express";

jest.mock("@trading-model/http/catch-error", () => ({
	catchSync: (fn: any) => fn,
}));

jest.mock("@trading-model/http/response-exception", () => ({
	sendResponse: (data: any, status: number) => ({ status, data }),
}));

jest.mock("@trading-model/http/logger", () => ({
	logger: {
		warn: jest.fn<(...args: any[]) => any>(),
		info: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
		debug: jest.fn<(...args: any[]) => any>(),
	},
}));

const ENV: any = {
	AUTH_TOKEN_HEADER: "x-api-key",
	AUTH_TOKENS: "a:read:valid-token-1,b:read:valid-token-2",
};

import { createAuthMiddleware } from "../../src/adapters/inbound/auth";

const AUTH_MIDDLEWARE = createAuthMiddleware(ENV);

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

	it("should accept Bearer scheme (case-insensitive)", async () => {
		for (const h of ["Bearer valid-token-1", "bearer valid-token-1"]) {
			const result = await AUTH_MIDDLEWARE(
				createReq({ headers: { authorization: h } }),
				createRes(),
				createNext
			);
			expect(result).toBeUndefined();
		}
	});

	it("should reject Bearer with invalid token", async () => {
		const result = await AUTH_MIDDLEWARE(
			createReq({ headers: { authorization: "Bearer nope" } }),
			createRes(),
			createNext
		);
		expect(result).toMatchObject({ status: 401 });
	});

	it("sets the key name and scopes of a named key", async () => {
		mockEnvTokens("ops-alice:read:alice-secret");
		const req: any = createReq({ headers: { "x-api-key": "alice-secret" } });

		const res = { setHeader: jest.fn() };
		await AUTH_MIDDLEWARE(req, res as any, createNext);

		expect(req.apiKeyName).toBe("ops-alice");
		expect(req.apiKeyScopes).toEqual(["read"]);
		expect(res.setHeader).toHaveBeenCalledWith("x-actor", "ops-alice");
	});

	it("ignores a bare-secret entry: its secret authenticates nobody", async () => {
		mockEnvTokens("bare-secret,ops:read:ok-secret");
		const result = await AUTH_MIDDLEWARE(
			createReq({ headers: { "x-api-key": "bare-secret" } }),
			createRes(),
			createNext
		);

		expect(result).toMatchObject({ status: 401 });
	});

	it("should give distinct identities to tokens sharing an 8-char prefix", async () => {
		mockEnvTokens("a:read:abcdefgh-1,b:read:abcdefgh-2");
		const ids = [];
		for (const t of ["abcdefgh-1", "abcdefgh-2"]) {
			const req: any = createReq({ headers: { "x-api-key": t } });
			await AUTH_MIDDLEWARE(req, createRes(), createNext);
			ids.push(req.clientIdentity);
		}
		expect(ids[0]).not.toEqual(ids[1]);
		expect(ids[0]).not.toContain("abcdefgh");
	});
});

function mockEnvTokens(tokens: string): void {
	ENV.AUTH_TOKENS = tokens;
}

describe("AUTH_MIDDLEWARE — strict mode", () => {
	const mockEnv = ENV;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should return 503 when AUTH_TOKENS is empty", async () => {
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
});
