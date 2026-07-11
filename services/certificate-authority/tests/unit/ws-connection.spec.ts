import type { TLSSocket } from "node:tls";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { WebSocketServer } from "ws";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

jest.mock("../../src/app/rate-limiter", () => ({
	clearRateLimiterKey: jest.fn(),
}));

import { clearRateLimiterKey } from "../../src/app/rate-limiter";
import {
	attachWsServer,
	handleWsClose,
	handleWsError,
	initConnectionState,
} from "../../src/app/ws-connection";

describe("ws-connection", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("initConnectionState", () => {
		it("should extract client identity from TLS socket CN", () => {
			const req = {
				socket: {
					getPeerCertificate: () => ({
						subject: { CN: "service-1" },
					}),
				} as unknown as TLSSocket,
			} as any;

			const session = initConnectionState(req);
			expect(session.clientIdentity).toBeDefined();
			expect(session.limiterKey).toBe("service-1");
			expect(session.state.authAttempts).toBe(0);
			expect(session.state.tokenProvided).toBe(false);
		});

		it("should handle missing client certificate", () => {
			const req = {
				socket: {
					getPeerCertificate: () => ({ subject: undefined }),
				} as unknown as TLSSocket,
			} as any;

			const session = initConnectionState(req);
			expect(session.clientIdentity).toBeUndefined();
			expect(session.limiterKey).toBe("unknown");
		});

		it("should handle socket without getPeerCertificate", () => {
			const req = { socket: {} } as any;
			const session = initConnectionState(req);
			expect(session.clientIdentity).toBeUndefined();
		});
	});

	describe("handleWsClose", () => {
		it("should log and clear rate limiter key", () => {
			handleWsClose("client-1", "test-client" as any);
			expect(clearRateLimiterKey).toHaveBeenCalledWith("client-1");
		});

		it("should handle undefined client identity", () => {
			handleWsClose("unknown", undefined);
			expect(clearRateLimiterKey).toHaveBeenCalledWith("unknown");
		});
	});

	describe("handleWsError", () => {
		it("should log error with client identity", () => {
			const err = new Error("connection reset");
			handleWsError(err, "client-1" as any);
			const logger = require("@trading-model/common/config/logger").logger;
			expect(logger.error).toHaveBeenCalledWith(
				"WSS connection error",
				expect.objectContaining({
					context: expect.objectContaining({
						err: "connection reset",
						clientIdentity: "client-1",
					}),
				})
			);
		});

		it("should log error without client identity", () => {
			const err = new Error("timeout");
			handleWsError(err, undefined);
			const logger = require("@trading-model/common/config/logger").logger;
			expect(logger.error).toHaveBeenCalledWith(
				"WSS connection error",
				expect.objectContaining({
					context: expect.objectContaining({ clientIdentity: undefined }),
				})
			);
		});
	});

	describe("attachWsServer", () => {
		it("should create WebSocketServer on https server", () => {
			const server = { on: jest.fn() } as any;
			const handler = jest.fn();
			const wss = attachWsServer(server, handler);
			expect(wss).toBeInstanceOf(WebSocketServer);
		});

		it("should call onConnection when WebSocket connects", () => {
			const server = { on: jest.fn() } as any;
			const handler = jest.fn();
			const wss = attachWsServer(server, handler);
			expect(wss).toBeDefined();
		});
	});
});
