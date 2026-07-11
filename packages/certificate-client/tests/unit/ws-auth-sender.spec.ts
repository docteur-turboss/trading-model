import { describe, expect, it, jest } from "@jest/globals";

import { WebSocket } from "ws";

describe("WsAuthSender", () => {
	function createMockWs(ws: Partial<WebSocket> = {}): WebSocket {
		return { readyState: WebSocket.OPEN, send: jest.fn(), ...ws } as any;
	}

	it("should send auth message when token is present and ws is connected", () => {
		const mockSend = jest.fn();
		const ws = createMockWs({ send: mockSend });

		const { WsAuthSender } =
			require("../../src/ws-auth-sender") as typeof import("../../src/ws-auth-sender");
		const sender = new WsAuthSender("my-token");
		sender.send(ws);

		expect(mockSend).toHaveBeenCalledWith(
			JSON.stringify({ type: "auth", token: "my-token" }),
			expect.any(Function)
		);
	});

	it("should not send when token is empty", () => {
		const mockSend = jest.fn();
		const ws = createMockWs({ send: mockSend });

		const { WsAuthSender } =
			require("../../src/ws-auth-sender") as typeof import("../../src/ws-auth-sender");
		const sender = new WsAuthSender("");
		sender.send(ws);

		expect(mockSend).not.toHaveBeenCalled();
	});

	it("should not send when token is undefined", () => {
		const mockSend = jest.fn();
		const ws = createMockWs({ send: mockSend });

		const { WsAuthSender } =
			require("../../src/ws-auth-sender") as typeof import("../../src/ws-auth-sender");
		const sender = new WsAuthSender();
		sender.send(ws);

		expect(mockSend).not.toHaveBeenCalled();
	});

	it("should not send when ws is null", () => {
		const { WsAuthSender } =
			require("../../src/ws-auth-sender") as typeof import("../../src/ws-auth-sender");
		const sender = new WsAuthSender("token");
		expect(() => sender.send(null)).not.toThrow();
	});

	it("should not send when ws is undefined", () => {
		const { WsAuthSender } =
			require("../../src/ws-auth-sender") as typeof import("../../src/ws-auth-sender");
		const sender = new WsAuthSender("token");
		expect(() => sender.send(undefined)).not.toThrow();
	});

	it("should not send when ws is not connected", () => {
		const mockSend = jest.fn();
		const ws = createMockWs({ readyState: WebSocket.CLOSED, send: mockSend });

		const { WsAuthSender } =
			require("../../src/ws-auth-sender") as typeof import("../../src/ws-auth-sender");
		const sender = new WsAuthSender("token");
		sender.send(ws);

		expect(mockSend).not.toHaveBeenCalled();
	});

	it("should log error when ws.send callback receives an error", () => {
		const sendError = new Error("send failed");
		const mockSend = jest
			.fn<any>()
			.mockImplementation((_data: any, cb: (err?: Error) => void) => {
				cb(sendError);
			});
		const ws = createMockWs({ send: mockSend });

		const { WsAuthSender } =
			require("../../src/ws-auth-sender") as typeof import("../../src/ws-auth-sender");
		const sender = new WsAuthSender("my-token");
		sender.send(ws);

		expect(mockSend).toHaveBeenCalled();
	});
});
