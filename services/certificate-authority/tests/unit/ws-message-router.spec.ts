import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { RawData, WebSocket } from "ws";

jest.mock("../../src/app/ws-response-formatter", () => ({
	sendJsonError: jest.fn(),
}));

import {
	type CaClientMessage,
	WsMessageRouter,
	WsMessageType,
} from "../../src/app/ws-message-router";
import { sendJsonError } from "../../src/app/ws-response-formatter";

describe("WsMessageRouter", () => {
	let router: WsMessageRouter;
	let mockWs: jest.Mocked<WebSocket>;
	let mockSession: any;

	beforeEach(() => {
		jest.clearAllMocks();
		router = new WsMessageRouter();
		mockWs = { send: jest.fn() } as any;
		mockSession = { state: {}, clientIdentity: "test" };
	});

	it("should register and dispatch a handler", async () => {
		const handler = jest.fn();
		router.register({
			type: WsMessageType.Auth,
			handle: handler,
		});

		const msg: CaClientMessage = {
			type: WsMessageType.Auth,
			token: "test-token",
		};
		const raw: RawData = Buffer.from(JSON.stringify(msg));

		await router.dispatch(mockWs, raw, mockSession);
		expect(handler).toHaveBeenCalledWith(mockWs, msg, mockSession);
	});

	it("should dispatch sign messages", async () => {
		const handler = jest.fn();
		router.register({
			type: WsMessageType.Sign,
			handle: handler,
		});

		const msg: CaClientMessage = {
			type: WsMessageType.Sign,
			id: "req-1",
			data: { serviceId: "svc-1", csr: "csr-data" },
		};
		const raw: RawData = Buffer.from(JSON.stringify(msg));

		await router.dispatch(mockWs, raw, mockSession);
		expect(handler).toHaveBeenCalledWith(mockWs, msg, mockSession);
	});

	it("should send error for invalid JSON", async () => {
		const raw: RawData = Buffer.from("not-json");
		await router.dispatch(mockWs, raw, mockSession);
		expect(sendJsonError).toHaveBeenCalledWith(mockWs, "Invalid JSON");
	});

	it("should send error for unknown message type", async () => {
		const raw: RawData = Buffer.from(JSON.stringify({ type: "unknown" }));
		await router.dispatch(mockWs, raw, mockSession);
		expect(sendJsonError).toHaveBeenCalledWith(
			mockWs,
			"Unknown message type: unknown"
		);
	});

	it("should handle empty message", async () => {
		const raw: RawData = Buffer.from("");
		await router.dispatch(mockWs, raw, mockSession);
		expect(sendJsonError).toHaveBeenCalledWith(mockWs, "Invalid JSON");
	});

	it("should allow registering multiple handlers", async () => {
		const authHandler = jest.fn();
		const signHandler = jest.fn();

		router.register({ type: WsMessageType.Auth, handle: authHandler });
		router.register({ type: WsMessageType.Sign, handle: signHandler });

		await router.dispatch(
			mockWs,
			Buffer.from(
				JSON.stringify({
					type: WsMessageType.Sign,
					id: "r1",
					data: { serviceId: "s1", csr: "c1" },
				})
			),
			mockSession
		);
		expect(authHandler).not.toHaveBeenCalled();
		expect(signHandler).toHaveBeenCalled();
	});
});
