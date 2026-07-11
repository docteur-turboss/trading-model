import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { WsMessageType } from "../../src/app/ws-message-router";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import {
	type AuthMessageContext,
	handleAuthMessage,
} from "../../src/app/ws-auth";

function makeContext(
	overrides: Partial<AuthMessageContext> = {}
): AuthMessageContext {
	return {
		ws: { send: jest.fn(), close: jest.fn() } as any,
		authMsg: { type: WsMessageType.Auth, token: "a".repeat(20) },
		state: {
			tokenProvided: false,
			bootstrapToken: undefined,
			authAttempts: 0,
			requestCount: 0,
			requestWindowStart: Date.now(),
		},
		clientIdentity: undefined,
		...overrides,
	};
}

describe("ws-auth", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should accept valid token and update state", () => {
		const ctx = makeContext();
		const result = handleAuthMessage(ctx);
		expect(result).toBe(true);
		expect(ctx.state.tokenProvided).toBe(true);
		expect(ctx.state.bootstrapToken).toBe("a".repeat(20));
	});

	it("should send success auth response for valid token", () => {
		const ctx = makeContext();
		handleAuthMessage(ctx);
		expect(ctx.ws.send).toHaveBeenCalledWith(
			JSON.stringify({
				type: WsMessageType.AuthResponse,
				success: true,
			})
		);
	});

	it("should reject token shorter than 16 chars", () => {
		const ctx = makeContext({
			authMsg: { type: WsMessageType.Auth, token: "short" },
		});
		const result = handleAuthMessage(ctx);
		expect(result).toBe(true);
		expect(ctx.state.tokenProvided).toBe(false);
	});

	it("should send failure auth response for invalid token", () => {
		const ctx = makeContext({
			authMsg: { type: WsMessageType.Auth, token: "short" },
		});
		handleAuthMessage(ctx);
		expect(ctx.ws.send).toHaveBeenCalledWith(
			JSON.stringify({
				type: WsMessageType.AuthResponse,
				success: false,
				error: { message: "Authentication failed" },
			})
		);
	});

	it("should reject token longer than 1024 chars", () => {
		const ctx = makeContext({
			authMsg: { type: WsMessageType.Auth, token: "x".repeat(1025) },
		});
		const result = handleAuthMessage(ctx);
		expect(result).toBe(true);
		expect(ctx.state.tokenProvided).toBe(false);
	});

	it("should reject token with non-printable characters", () => {
		const ctx = makeContext({
			authMsg: { type: WsMessageType.Auth, token: `${"a".repeat(16)}\n` },
		});
		handleAuthMessage(ctx);
		expect(ctx.state.tokenProvided).toBe(false);
	});

	it("should close connection after exceeding max auth attempts", () => {
		const ctx = makeContext({
			state: {
				tokenProvided: false,
				bootstrapToken: undefined,
				authAttempts: 6,
				requestCount: 0,
				requestWindowStart: Date.now(),
			},
		});
		const result = handleAuthMessage(ctx);
		expect(result).toBe(false);
		expect(ctx.ws.close).toHaveBeenCalledWith(
			4001,
			"Too many authentication attempts"
		);
	});

	it("should increment auth attempts on each call", () => {
		const ctx = makeContext({
			state: {
				tokenProvided: false,
				bootstrapToken: undefined,
				authAttempts: 3,
				requestCount: 0,
				requestWindowStart: Date.now(),
			},
		});
		handleAuthMessage(ctx);
		expect(ctx.state.authAttempts).toBe(4);
	});

	it("should handle non-string token gracefully", () => {
		const ctx = makeContext({
			authMsg: { type: WsMessageType.Auth, token: undefined } as any,
		});
		const result = handleAuthMessage(ctx);
		expect(result).toBe(true);
	});

	it("should log warning for invalid token format", () => {
		const ctx = makeContext({
			authMsg: { type: WsMessageType.Auth, token: "x" },
		});
		handleAuthMessage(ctx);
		const logger = require("@trading-model/common/config/logger").logger;
		expect(logger.warn).toHaveBeenCalledWith(
			"WSS client sent invalid auth token format",
			expect.any(Object)
		);
	});
});
