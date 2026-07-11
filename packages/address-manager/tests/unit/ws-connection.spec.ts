import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { URLString } from "@trading-model/common/domain/primitives";

const mockWs = {
	on: jest.fn<(event: string, handler: (...args: any[]) => void) => void>(),
	close: jest.fn<(code?: number, reason?: string) => void>(),
	send: jest.fn<(data: unknown) => void>(),
	readyState: 1,
};

const MockWebSocket = jest.fn(() => mockWs) as jest.Mock & { OPEN: number };
MockWebSocket.OPEN = 1;

jest.mock("ws", () => ({
	__esModule: true,
	default: MockWebSocket,
}));

import { WsConnection } from "../../src/client/ws-connection";

const BASE_URL = URLString.of("ws://localhost:8080");

describe("WsConnection", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockWs.readyState = 1;
	});

	test("constructor accepts base URL without token", () => {
		const conn = new WsConnection(BASE_URL);
		expect(conn).toBeInstanceOf(WsConnection);
	});

	test("constructor accepts base URL with token", () => {
		const conn = new WsConnection(BASE_URL, "test-token");
		expect(conn).toBeInstanceOf(WsConnection);
	});

	test("url getter returns base URL when no token is set", () => {
		const conn = new WsConnection(BASE_URL);
		expect(conn.url).toBe(BASE_URL);
	});

	test("url getter appends token as query parameter", () => {
		const conn = new WsConnection(BASE_URL, "my-token");
		expect(conn.url).toBe("ws://localhost:8080/?token=my-token");
	});

	test("connect() creates WebSocket with correct URL", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		expect(MockWebSocket).toHaveBeenCalledTimes(1);
		expect(MockWebSocket.mock.calls[0][0]).toBe(BASE_URL);
	});

	test("connect() uses URL with token when token is set", () => {
		const conn = new WsConnection(BASE_URL, "token123");
		conn.connect();
		expect(MockWebSocket).toHaveBeenCalledTimes(1);
		expect(MockWebSocket.mock.calls[0][0]).toBe(
			"ws://localhost:8080/?token=token123"
		);
	});

	test("connect() registers open, message, close, and error event handlers", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		expect(mockWs.on).toHaveBeenCalledTimes(4);
		expect(mockWs.on).toHaveBeenCalledWith("open", expect.any(Function));
		expect(mockWs.on).toHaveBeenCalledWith("message", expect.any(Function));
		expect(mockWs.on).toHaveBeenCalledWith("close", expect.any(Function));
		expect(mockWs.on).toHaveBeenCalledWith("error", expect.any(Function));
	});

	test("connect() handles WebSocket construction error gracefully", () => {
		const conn = new WsConnection(BASE_URL);
		MockWebSocket.mockImplementationOnce(() => {
			throw new Error("connection failed");
		});
		expect(() => conn.connect()).not.toThrow();
		expect(conn.isConnected).toBe(false);
	});

	test("disconnect() calls ws.close without arguments", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		conn.disconnect();
		expect(mockWs.close).toHaveBeenCalledWith(undefined, undefined);
	});

	test("disconnect() passes closeCode and reason to ws.close", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		conn.disconnect(1000, "normal");
		expect(mockWs.close).toHaveBeenCalledWith(1000, "normal");
	});

	test("disconnect() is safe when ws is null", () => {
		const conn = new WsConnection(BASE_URL);
		expect(() => conn.disconnect()).not.toThrow();
		expect(() => conn.disconnect(1000, "going away")).not.toThrow();
	});

	test("isConnected returns true when ws exists and readyState is OPEN", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		mockWs.readyState = 1;
		expect(conn.isConnected).toBe(true);
	});

	test("isConnected returns false when ws is null", () => {
		const conn = new WsConnection(BASE_URL);
		expect(conn.isConnected).toBe(false);
	});

	test("isConnected returns false when readyState is not OPEN", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		mockWs.readyState = 0;
		expect(conn.isConnected).toBe(false);
	});

	test("send() sends string data directly", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		const result = conn.send("hello");
		expect(result).toBe(true);
		expect(mockWs.send).toHaveBeenCalledWith("hello");
	});

	test("send() serializes object data to JSON string", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		const result = conn.send({ foo: "bar" });
		expect(result).toBe(true);
		expect(mockWs.send).toHaveBeenCalledWith('{"foo":"bar"}');
	});

	test("send() returns false when ws is null", () => {
		const conn = new WsConnection(BASE_URL);
		const result = conn.send("data");
		expect(result).toBe(false);
		expect(mockWs.send).not.toHaveBeenCalled();
	});

	test("send() returns false when ws is not in OPEN state", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		mockWs.readyState = 0;
		const result = conn.send("data");
		expect(result).toBe(false);
		expect(mockWs.send).not.toHaveBeenCalled();
	});

	test("updateToken() updates internal token affecting url getter", () => {
		const conn = new WsConnection(BASE_URL);
		expect(conn.url).toBe(BASE_URL);
		conn.updateToken("new-token");
		expect(conn.url).toBe("ws://localhost:8080/?token=new-token");
	});

	test("open handler invokes onOpen callback", () => {
		const conn = new WsConnection(BASE_URL);
		conn.onOpen = jest.fn();
		conn.connect();
		const openHandler = mockWs.on.mock.calls.find(
			(call) => call[0] === "open"
		)?.[1] as (...args: any[]) => void;
		openHandler();
		expect(conn.onOpen).toHaveBeenCalled();
	});

	test("message handler passes received data to onMessage", () => {
		const conn = new WsConnection(BASE_URL);
		conn.onMessage = jest.fn();
		conn.connect();
		const msgHandler = mockWs.on.mock.calls.find(
			(call) => call[0] === "message"
		)?.[1] as (...args: any[]) => void;
		msgHandler("some data");
		expect(conn.onMessage).toHaveBeenCalledWith("some data");
	});

	test("close handler sets lastCloseCode and invokes onCloseHandler", () => {
		const conn = new WsConnection(BASE_URL);
		conn.onCloseHandler = jest.fn();
		conn.connect();
		const closeHandler = mockWs.on.mock.calls.find(
			(call) => call[0] === "close"
		)?.[1] as (...args: any[]) => void;
		closeHandler(1006);
		expect(conn.lastCloseCode).toBe(1006);
		expect(conn.onCloseHandler).toHaveBeenCalled();
	});

	test("error handler passes error to onError callback", () => {
		const conn = new WsConnection(BASE_URL);
		conn.onError = jest.fn();
		conn.connect();
		const errorHandler = mockWs.on.mock.calls.find(
			(call) => call[0] === "error"
		)?.[1] as (...args: any[]) => void;
		const testErr = new Error("test error");
		errorHandler(testErr);
		expect(conn.onError).toHaveBeenCalledWith(testErr);
	});

	test("default onOpen does not throw when invoked", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		const openHandler = mockWs.on.mock.calls.find(
			(call) => call[0] === "open"
		)?.[1] as (...args: any[]) => void;
		expect(() => openHandler()).not.toThrow();
	});

	test("default onMessage does not throw when invoked", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		const msgHandler = mockWs.on.mock.calls.find(
			(call) => call[0] === "message"
		)?.[1] as (...args: any[]) => void;
		expect(() => msgHandler("data")).not.toThrow();
	});

	test("default onError does not throw when invoked", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		const errorHandler = mockWs.on.mock.calls.find(
			(call) => call[0] === "error"
		)?.[1] as (...args: any[]) => void;
		expect(() => errorHandler(new Error("err"))).not.toThrow();
	});

	test("default onCloseHandler does not throw when invoked", () => {
		const conn = new WsConnection(BASE_URL);
		conn.connect();
		const closeHandler = mockWs.on.mock.calls.find(
			(call) => call[0] === "close"
		)?.[1] as (...args: any[]) => void;
		expect(() => closeHandler(1006)).not.toThrow();
	});
});
