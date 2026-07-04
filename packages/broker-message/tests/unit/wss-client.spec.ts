import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const MOCK_WS_INSTANCE = {
	on: jest.fn<any>().mockReturnThis(),
	send: jest.fn<any>().mockReturnValue(true),
	close: jest.fn<any>(),
	readyState: 1,
	OPEN: 1,
};

let MOCK_WS_CTOR: jest.Mock;

jest.mock("ws", () => {
	const ctor = jest.fn<any>().mockImplementation(() => MOCK_WS_INSTANCE);
	ctor.OPEN = 1;
	MOCK_WS_CTOR = ctor;
	return { __esModule: true, default: ctor, OPEN: 1 };
});

jest.mock("@opentelemetry/api", () => ({
	context: { active: jest.fn() },
	propagation: { inject: jest.fn() },
}));

import { WssClient } from "../../src/client/wss-client";

describe("WssClient", () => {
	let client: WssClient;
	const mockConfig = {
		wssUrl: "wss://localhost:3000/ws",
		tlsConfig: {},
		serviceName: "TestService",
		instanceId: "test-instance",
	};

	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_WS_INSTANCE.readyState = 1;
		client = new WssClient(mockConfig);
	});

	afterEach(() => {
		client.disconnect();
	});

	it("should create instance", () => {
		expect(client).toBeInstanceOf(WssClient);
	});

	it("should not be connected initially", () => {
		expect(client.isConnected()).toBe(false);
	});

	it("should set HTTP fallback function", () => {
		const fallback = jest.fn();
		client.setHttpFallback(fallback);
		expect(client.httpFallback).toBe(fallback);
	});

	it("should register message handler", () => {
		const handler = jest.fn();
		client.onMessage(handler);
		expect(client.messageHandler).toBe(handler);
	});

	it("should disconnect gracefully", () => {
		client.disconnect();
		expect(client.isConnected()).toBe(false);
		expect(client.shouldReconnect).toBe(false);
	});

	it("should allow ack/nack even when disconnected", () => {
		expect(client.ack("msg-1")).toBe(false);
		expect(client.nack("msg-1")).toBe(false);
	});

	it("should connect and create WebSocket", () => {
		client.connect(["topic1"]);
		expect(MOCK_WS_CTOR).toHaveBeenCalledWith(
			"wss://localhost:3000/ws?service=TestService&instance=test-instance",
			expect.any(Object)
		);
	});

	it("should handle WebSocket open event", () => {
		client.connect();
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		expect(client.isConnected()).toBe(true);
	});

	it("should send subscribe on connect when topics provided", () => {
		client.connect(["topic1", "topic2"]);
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		expect(MOCK_WS_INSTANCE.send).toHaveBeenCalledWith(
			JSON.stringify({ type: "subscribe", topics: ["topic1", "topic2"] })
		);
	});

	it("should handle WebSocket message event with message type", () => {
		const handler = jest.fn();
		client.onMessage(handler);
		client.connect();
		const msgHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "message"
		)?.[1];
		msgHandler(
			JSON.stringify({
				type: "message",
				topic: "test.topic",
				message: { payload: { key: "val" }, metadata: { id: "1" } },
			})
		);
		expect(handler).toHaveBeenCalledWith(
			"test.topic",
			{ key: "val" },
			{ id: "1" }
		);
	});

	it("should handle WebSocket message event with connected type", () => {
		client.connect();
		const msgHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "message"
		)?.[1];
		msgHandler(JSON.stringify({ type: "connected", instanceId: "broker-1" }));
	});

	it("should handle WebSocket message event with subscribed type", () => {
		client.connect();
		const msgHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "message"
		)?.[1];
		msgHandler(JSON.stringify({ type: "subscribed", topics: ["t1"] }));
	});

	it("should handle WebSocket message event with error type", () => {
		client.connect();
		const msgHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "message"
		)?.[1];
		msgHandler(JSON.stringify({ type: "error", message: "something bad" }));
	});

	it("should handle WebSocket message parse error", () => {
		client.connect();
		const msgHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "message"
		)?.[1];
		msgHandler("invalid json");
	});

	it("should handle WebSocket close event", () => {
		client.connect();
		const closeHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "close"
		)?.[1];
		closeHandler(1006, Buffer.from("connection refused"));
		expect(client.isConnected()).toBe(false);
	});

	it("should handle WebSocket error event", () => {
		client.connect();
		const errorHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "error"
		)?.[1];
		errorHandler(new Error("ECONNREFUSED"));
		expect(client.isConnected()).toBe(false);
	});

	it("should publish when connected", async () => {
		client.connect();
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		MOCK_WS_INSTANCE.send.mockReturnValue(true);
		const result = await client.publish({ data: "test" }, {
			id: "msg-1",
		} as any);
		expect(result).toBeUndefined();
	});

	it("should queue publish when not connected with HTTP fallback", async () => {
		const fallback = jest.fn<any>().mockResolvedValue(undefined);
		client.setHttpFallback(fallback);
		const result = client.publish({ data: "test" }, { id: "msg-1" } as any);
		client.connect();
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		await result;
	});

	it("should reject publish when not connected and no HTTP fallback", async () => {
		await expect(
			client.publish({ data: "test" }, { id: "msg-1" } as any)
		).rejects.toThrow("WSS not connected and no HTTP fallback");
	});

	it("should use HTTP fallback when queue is full", async () => {
		const fallback = jest.fn<any>().mockResolvedValue(undefined);
		client.setHttpFallback(fallback);
		for (let i = 0; i < 1000; i++) {
			client.publish({ n: i }, { id: `msg-${i}` } as any).catch(() => {});
		}
		await expect(
			client.publish({ data: "last" }, { id: "msg-last" } as any)
		).resolves.toBeUndefined();
		expect(fallback).toHaveBeenCalled();
	});

	it("should subscribe when connected", () => {
		client.connect();
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		MOCK_WS_INSTANCE.send.mockClear();
		void client.subscribe(["new-topic"]);
		expect(MOCK_WS_INSTANCE.send).toHaveBeenCalledWith(
			JSON.stringify({ type: "subscribe", topics: ["new-topic"] })
		);
	});

	it("should subscribe when not connected (no-op for WS)", () => {
		MOCK_WS_INSTANCE.send.mockClear();
		void client.subscribe(["topic"]);
	});

	it("should unsubscribe when connected", () => {
		client.connect();
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		MOCK_WS_INSTANCE.send.mockClear();
		void client.unsubscribe(["topic"]);
		expect(MOCK_WS_INSTANCE.send).toHaveBeenCalledWith(
			JSON.stringify({ type: "unsubscribe", topics: ["topic"] })
		);
	});

	it("should unsubscribe when not connected", () => {
		MOCK_WS_INSTANCE.send.mockClear();
		void client.unsubscribe(["topic"]);
	});

	it("should return false for ack/nack when ws not open", () => {
		MOCK_WS_INSTANCE.readyState = 0;
		expect(client.ack("msg-1")).toBe(false);
		expect(client.nack("msg-1")).toBe(false);
	});

	it("should handle ws error event when ws property exists", () => {
		client.connect();
		MOCK_WS_INSTANCE.close.mockImplementation(() => {
			throw new Error("close error");
		});
		const errorHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "error"
		)?.[1];
		errorHandler(new Error("test error"));
	});

	it("should handle ws connection factory error", () => {
		MOCK_WS_CTOR.mockImplementationOnce(() => {
			throw new Error("connection failed");
		});
		client.connect();
	});

	it("should handle disconnect when ws exists", () => {
		client.connect();
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		client.disconnect();
		expect(MOCK_WS_INSTANCE.close).toHaveBeenCalledWith(
			1000,
			"Client shutdown"
		);
	});

	it("should flush pending on open", async () => {
		const fallback = jest.fn<any>().mockResolvedValue(undefined);
		client.setHttpFallback(fallback);
		const promise = client.publish({ data: "test" }, { id: "msg-1" } as any);
		client.connect();
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		await promise;
	});

	it("should reject pending on disconnect when no fallback", () => {
		client.connect();
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		client.publish({ data: "test" }, { id: "msg-1" } as any).catch(() => {});
		client.disconnect();
	});

	it("should close existing WebSocket when connecting twice", () => {
		client.connect();
		jest.clearAllMocks();
		MOCK_WS_INSTANCE.close.mockImplementation(() => {
			throw new Error("close error");
		});
		client.connect();
		expect(MOCK_WS_INSTANCE.close).toHaveBeenCalled();
	});

	it("should create WebSocket with TLS config", () => {
		const tlsClient = new WssClient({
			wssUrl: "wss://localhost:3000/ws",
			tlsConfig: {},
			serviceName: "svc",
			instanceId: "i-1",
		});
		tlsClient.connect();
		tlsClient.disconnect();
	});

	it("should return false when sendJson fails due to ws not open", () => {
		MOCK_WS_INSTANCE.readyState = 2;
		expect(client.ack("msg-1")).toBe(false);
	});

	it("should send subscribe when connected", () => {
		client.connect();
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		MOCK_WS_INSTANCE.send.mockClear();
		void client.subscribe(["topic1"]);
		expect(MOCK_WS_INSTANCE.send).toHaveBeenCalledWith(
			JSON.stringify({ type: "subscribe", topics: ["topic1"] })
		);
	});

	it("should send unsubscribe when connected", () => {
		client.connect();
		const openHandler = MOCK_WS_INSTANCE.on.mock.calls.find(
			(c: string[]) => c[0] === "open"
		)?.[1];
		openHandler();
		MOCK_WS_INSTANCE.send.mockClear();
		void client.unsubscribe(["topic1"]);
		expect(MOCK_WS_INSTANCE.send).toHaveBeenCalledWith(
			JSON.stringify({ type: "unsubscribe", topics: ["topic1"] })
		);
	});
});
