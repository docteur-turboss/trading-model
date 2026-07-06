import {
	afterEach,
	beforeEach,
	describe,
	expect,
	jest,
	test,
} from "@jest/globals";

// Mock WebSocket before importing
const MOCK_WEB_SOCKET_INSTANCE: Record<string, unknown> = {
	on: jest.fn(),
	send: jest.fn(),
	close: jest.fn(),
	readyState: 1, // OPEN
};
const MOCK_WEB_SOCKET = jest.fn(() => MOCK_WEB_SOCKET_INSTANCE) as jest.Mock & {
	OPEN: number;
	CONNECTING: number;
};
MOCK_WEB_SOCKET.OPEN = 1;
MOCK_WEB_SOCKET.CONNECTING = 0;
jest.mock("ws", () => ({
	__esModule: true,
	default: MOCK_WEB_SOCKET,
}));

const MOCK_WARN = jest.fn();
jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		warn: MOCK_WARN,
		error: jest.fn(),
	},
}));

import { WebSocketClient } from "../../src/client/websocket-client";

describe("WebSocketClient", () => {
	let client: WebSocketClient;

	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_WEB_SOCKET_INSTANCE.readyState = MOCK_WEB_SOCKET.OPEN;
		client = new WebSocketClient({ url: "ws://localhost:3000" });
	});

	afterEach(() => {
		client.disconnect();
	});

	describe("connect", () => {
		test("should create a new WebSocket connection", () => {
			client.connect();
			expect(MOCK_WEB_SOCKET).toHaveBeenCalledWith("ws://localhost:3000");
		});

		test("should not create duplicate connections", () => {
			client.connect();
			client.connect();
			expect(MOCK_WEB_SOCKET).toHaveBeenCalledTimes(1);
		});

		test("should register event handlers on the WebSocket", () => {
			client.connect();
			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			expect(onMock).toHaveBeenCalledWith("open", expect.any(Function));
			expect(onMock).toHaveBeenCalledWith("message", expect.any(Function));
			expect(onMock).toHaveBeenCalledWith("close", expect.any(Function));
			expect(onMock).toHaveBeenCalledWith("error", expect.any(Function));
		});

		test("should handle connection errors gracefully", () => {
			MOCK_WEB_SOCKET.mockImplementationOnce(() => {
				throw new Error("Connection refused");
			});
			client = new WebSocketClient({ url: "ws://bad-host:3000" });
			expect(() => client.connect()).not.toThrow();
		});

		test("should handle WebSocket error events gracefully", () => {
			client.connect();
			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			const errorCall = onMock.mock.calls.find(
				(c: unknown[]) => c[0] === "error"
			);
			expect(errorCall).toBeDefined();
			if (errorCall) {
				const handler = errorCall[1] as (error: Error) => void;
				expect(() => handler(new Error("test error"))).not.toThrow();
			}
		});

		test("should set reconnectAttempts to 0 and subscribe on open", () => {
			client.connect();
			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			const openCall = onMock.mock.calls.find(
				(c: unknown[]) => c[0] === "open"
			);
			expect(openCall).toBeDefined();
			if (openCall) {
				const handler = openCall[1] as () => void;
				MOCK_WEB_SOCKET_INSTANCE.readyState = MOCK_WEB_SOCKET.OPEN;
				handler();
			}
			expect(client.getReconnectAttempts()).toBe(0);
			const sendMock = MOCK_WEB_SOCKET_INSTANCE.send as jest.Mock;
			expect(sendMock).toHaveBeenCalledWith(
				JSON.stringify({ type: "subscribe", payload: { services: ["*"] } })
			);
		});
	});

	describe("isConnected", () => {
		test("should return false when not connected", () => {
			expect(client.isConnected()).toBe(false);
		});

		test("should return true when connected and readyState is OPEN", () => {
			client.connect();
			expect(client.isConnected()).toBe(true);
		});

		test("should return false when readyState is not OPEN", () => {
			MOCK_WEB_SOCKET_INSTANCE.readyState = MOCK_WEB_SOCKET.CONNECTING;
			client.connect();
			expect(client.isConnected()).toBe(false);
		});
	});

	describe("send", () => {
		test("should send JSON message when connected", () => {
			client.connect();
			const sendMock = MOCK_WEB_SOCKET_INSTANCE.send as jest.Mock;
			const result = client.send("heartbeat", { serviceName: "test" });
			expect(result).toBe(true);
			expect(sendMock).toHaveBeenCalledWith(
				JSON.stringify({ type: "heartbeat", payload: { serviceName: "test" } })
			);
		});

		test("should return false when not connected", () => {
			const sendMock = MOCK_WEB_SOCKET_INSTANCE.send as jest.Mock;
			const result = client.send("heartbeat", { serviceName: "test" });
			expect(result).toBe(false);
			expect(sendMock).not.toHaveBeenCalled();
		});
	});

	describe("onMessage", () => {
		test("should invoke handler when message is received", () => {
			const handler = jest.fn();
			client.onMessage(handler);
			client.connect();

			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			const messageCall = onMock.mock.calls.find(
				(c: unknown[]) => c[0] === "message"
			);
			expect(messageCall).toBeDefined();
			if (messageCall) {
				const msgHandler = messageCall[1] as (data: Buffer) => void;
				msgHandler(
					Buffer.from(JSON.stringify({ type: "heartbeat", payload: {} }))
				);
				expect(handler).toHaveBeenCalledWith({
					type: "heartbeat",
					payload: {},
				});
			}
		});

		test("should not throw on invalid JSON", () => {
			const handler = jest.fn();
			client.onMessage(handler);
			client.connect();

			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			const messageCall = onMock.mock.calls.find(
				(c: unknown[]) => c[0] === "message"
			);
			expect(messageCall).toBeDefined();
			if (messageCall) {
				const msgHandler = messageCall[1] as (data: Buffer) => void;
				expect(() => msgHandler(Buffer.from("invalid json"))).not.toThrow();
				expect(handler).not.toHaveBeenCalled();
			}
		});
	});

	describe("disconnect", () => {
		test("should close WebSocket and clear reconnect timer", () => {
			client.connect();
			client.disconnect();
			const closeMock = MOCK_WEB_SOCKET_INSTANCE.close as jest.Mock;
			expect(closeMock).toHaveBeenCalled();
		});

		test("should be safe to call when not connected", () => {
			expect(() => client.disconnect()).not.toThrow();
		});
	});

	describe("getReconnectAttempts", () => {
		test("should return 0 initially", () => {
			expect(client.getReconnectAttempts()).toBe(0);
		});

		test("should increment on close", () => {
			client.connect();
			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			const closeCall = onMock.mock.calls.find(
				(c: unknown[]) => c[0] === "close"
			);
			expect(closeCall).toBeDefined();
			if (closeCall) {
				const handler = closeCall[1] as () => void;
				handler();
			}
			expect(client.getReconnectAttempts()).toBe(1);
		});

		test("should log warning when max reconnect attempts reached", () => {
			client = new WebSocketClient({
				url: "ws://localhost:3000",
				maxReconnectAttempts: 3,
			});

			client.connect();
			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			const closeHandler = onMock.mock.calls.find(
				(c: unknown[]) => c[0] === "close"
			)![1] as () => void;

			for (let i = 0; i <= 3; i++) {
				closeHandler();
			}

			expect(MOCK_WARN).toHaveBeenCalledWith(
				"WebSocket max reconnect attempts reached",
				expect.objectContaining({
					url: "ws://localhost:3000",
					attempts: 3,
				})
			);
		});

		test("should call connect again when reconnect timer fires", () => {
			jest.useFakeTimers();
			client = new WebSocketClient({
				url: "ws://localhost:3000",
				reconnectIntervalMs: 50,
				maxReconnectAttempts: 5,
			});

			client.connect();
			expect(MOCK_WEB_SOCKET).toHaveBeenCalledTimes(1);

			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			const closeHandler = onMock.mock.calls.find(
				(c: unknown[]) => c[0] === "close"
			)![1] as () => void;
			closeHandler();

			expect(client.getReconnectAttempts()).toBe(1);

			jest.advanceTimersByTime(50);

			expect(MOCK_WEB_SOCKET).toHaveBeenCalledTimes(2);
			jest.useRealTimers();
		});

		test("should not reconnect when disconnect was called before close", () => {
			client = new WebSocketClient({
				url: "ws://localhost:3000",
				maxReconnectAttempts: 10,
			});
			client.connect();

			client.disconnect();

			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			const closeHandler = onMock.mock.calls.find(
				(c: unknown[]) => c[0] === "close"
			)![1] as () => void;
			closeHandler();

			expect(client.getReconnectAttempts()).toBe(0);
		});

		test("should call auth failure handler on close with code 4001", () => {
			const authHandler = jest.fn();
			client.onAuthFailure(authHandler);
			client.connect();

			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			const closeHandler = onMock.mock.calls.find(
				(c: unknown[]) => c[0] === "close"
			)![1] as (code: number) => void;

			closeHandler(4001);
			expect(authHandler).toHaveBeenCalled();
		});

		test("should not call auth failure handler on normal close", () => {
			const authHandler = jest.fn();
			client.onAuthFailure(authHandler);
			client.connect();

			const onMock = MOCK_WEB_SOCKET_INSTANCE.on as jest.Mock;
			const closeHandler = onMock.mock.calls.find(
				(c: unknown[]) => c[0] === "close"
			)![1] as () => void;

			closeHandler();
			expect(authHandler).not.toHaveBeenCalled();
		});
	});

	describe("onAuthFailure", () => {
		test("should register auth failure handler", () => {
			const handler = jest.fn();
			client.onAuthFailure(handler);
			expect(() => client.onAuthFailure(handler)).not.toThrow();
		});
	});

	describe("updateToken", () => {
		test("should update the stored token", () => {
			client.updateToken("new-token");
			client.connect();
			expect(MOCK_WEB_SOCKET).toHaveBeenCalledWith(
				expect.stringContaining("token=new-token")
			);
		});
	});

	describe("sendHeartbeat", () => {
		test("should send heartbeat message when connected", () => {
			client.connect();
			const result = client.sendHeartbeat({ serviceName: "test-service", instanceId: "instance-1" });
			expect(result).toBe(true);
			const sendMock = MOCK_WEB_SOCKET_INSTANCE.send as jest.Mock;
			expect(sendMock).toHaveBeenCalledWith(
				JSON.stringify({
					type: "heartbeat",
					payload: { serviceName: "test-service", instanceId: "instance-1" },
				})
			);
		});

		test("should return false when not connected", () => {
			const result = client.sendHeartbeat({ serviceName: "test-service", instanceId: "instance-1" });
			expect(result).toBe(false);
		});
	});
});
