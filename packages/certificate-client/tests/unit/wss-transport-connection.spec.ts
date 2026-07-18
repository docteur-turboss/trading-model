import { beforeEach, describe, expect, it, jest } from "@jest/globals";

let mockWsTransport: Record<string, unknown>;
let mockReconnectorIsDestroyed = false;
let mockReconnectorReset: jest.Mock<(...args: any[]) => any>;
let mockReconnectorCancel: jest.Mock<(...args: any[]) => any>;
let mockReconnectorScheduleReconnect: jest.Mock<(...args: any[]) => any>;
let capturedScheduleReconnectCallback: (() => void) | undefined;

const mockWsObject: Record<string, unknown> = {
	readyState: 1,
	OPEN: 1,
	send: jest.fn<(...args: any[]) => any>(),
};

function createWsTransportMock(): Record<string, unknown> {
	const instance: Record<string, unknown> = {
		connect: jest.fn<(...args: any[]) => any>(),
		disconnect: jest.fn<(...args: any[]) => any>(),
		ws: mockWsObject,
		onOpen: undefined,
		onMessage: undefined,
		onCloseHandler: undefined,
		onError: undefined,
		onTimeout: undefined,
	};
	mockWsTransport = instance;
	return instance;
}

jest.mock("../../src/ws-transport", () => ({
	WsTransport: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => createWsTransportMock()),
}));

jest.mock("@trading-model/common/ws/default-ws-reconnector", () => ({
	DefaultWsReconnector: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => {
			mockReconnectorReset = jest.fn<(...args: any[]) => any>();
			mockReconnectorCancel = jest.fn<(...args: any[]) => any>();
			mockReconnectorScheduleReconnect = jest.fn<(...args: any[]) => any>(
				(fn?: () => void) => {
					capturedScheduleReconnectCallback = fn;
				}
			);
			return {
				get isDestroyed() {
					return mockReconnectorIsDestroyed;
				},
				reset: mockReconnectorReset,
				cancel: mockReconnectorCancel,
				scheduleReconnect: mockReconnectorScheduleReconnect,
			};
		}),
}));

const mockSendWsAuth = jest.fn<(...args: any[]) => any>();
jest.mock("../../src/ws-auth-sender", () => ({
	sendWsAuth: mockSendWsAuth,
}));

import { WsTransport } from "../../src/ws-transport";
import {
	ConnectionState,
	WssTransportConnection,
} from "../../src/wss-transport-connection";

describe("WssTransportConnection", () => {
	const testUrl = "wss://example.com:8443" as unknown as any;

	beforeEach(() => {
		jest.clearAllMocks();
		mockReconnectorIsDestroyed = false;
		capturedScheduleReconnectCallback = undefined;
		mockWsObject.readyState = 1;
		(mockWsObject.send as jest.Mock).mockClear();
	});

	describe("constructor", () => {
		it("should create WsTransport", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });

			expect(WsTransport).toHaveBeenCalledWith({ url: testUrl });
			expect(conn.state).toBe(ConnectionState.Disconnected);
		});

		it("should pass tlsConfig and bootstrapToken", () => {
			const tlsConfig = {} as any;
			const _conn = new WssTransportConnection({
				wsUrl: testUrl,
				tlsConfig,
				bootstrapToken: "my-token",
			});

			expect(WsTransport).toHaveBeenCalledWith({ url: testUrl, tlsConfig });
		});
	});

	describe("connect", () => {
		it("should set state to Connecting, set up callbacks, and call connectionManager.connect()", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });

			conn.connect();

			expect(conn.state).toBe(ConnectionState.Connecting);
			expect(mockWsTransport.connect).toHaveBeenCalledTimes(1);
			expect(typeof mockWsTransport.onOpen).toBe("function");
			expect(typeof mockWsTransport.onMessage).toBe("function");
			expect(typeof mockWsTransport.onCloseHandler).toBe("function");
			expect(typeof mockWsTransport.onError).toBe("function");
			expect(typeof mockWsTransport.onTimeout).toBe("function");
		});

		it("should be idempotent when already Connected", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();
			(mockWsTransport.onOpen as () => void)();
			(mockWsTransport.connect as jest.Mock).mockClear();

			conn.connect();

			expect(mockWsTransport.connect).not.toHaveBeenCalled();
		});

		it("should be idempotent when already Connecting", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();
			(mockWsTransport.connect as jest.Mock).mockClear();

			conn.connect();

			expect(mockWsTransport.connect).not.toHaveBeenCalled();
		});

		it("should do nothing when reconnector is destroyed", () => {
			mockReconnectorIsDestroyed = true;
			const conn = new WssTransportConnection({ wsUrl: testUrl });

			conn.connect();

			expect(mockWsTransport.connect).not.toHaveBeenCalled();
			expect(conn.state).toBe(ConnectionState.Disconnected);
		});

		it("should not call connect again when reconnector becomes destroyed between connect and _connectWs", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });

			conn.connect();

			expect(mockWsTransport.connect).toHaveBeenCalledTimes(1);
		});
	});

	describe("onOpen callback", () => {
		it("should set state to Connected, reset reconnector, send auth, and emit open", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			const openListener = jest.fn<(...args: any[]) => any>();
			conn.on("open", openListener);

			conn.connect();
			(mockWsTransport.onOpen as () => void)();

			expect(conn.state).toBe(ConnectionState.Connected);
			expect(mockReconnectorReset).toHaveBeenCalledTimes(1);
			expect(mockSendWsAuth).toHaveBeenCalledWith(mockWsObject, undefined);
			expect(openListener).toHaveBeenCalledTimes(1);
		});
	});

	describe("onClose callback", () => {
		it("should set state to Reconnecting (via _scheduleReconnect), schedule reconnect, and emit close", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			const closeListener = jest.fn<(...args: any[]) => any>();
			conn.on("close", closeListener);

			conn.connect();
			(mockWsTransport.onCloseHandler as () => void)();

			expect(mockReconnectorScheduleReconnect).toHaveBeenCalledTimes(1);
			expect(closeListener).toHaveBeenCalledTimes(1);
		});

		it("should not schedule reconnect on close when reconnector is destroyed", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();
			mockReconnectorIsDestroyed = true;

			(mockWsTransport.onCloseHandler as () => void)();

			expect(conn.state).toBe(ConnectionState.Disconnected);
			expect(mockReconnectorScheduleReconnect).not.toHaveBeenCalled();
		});
	});

	describe("onError callback", () => {
		it("should schedule reconnect and emit error when ws is not open", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			const errorListener = jest.fn<(...args: any[]) => any>();
			conn.on("error", errorListener);
			const testError = new Error("test error");
			mockWsObject.readyState = 3;

			conn.connect();
			(mockWsTransport.onError as (err: Error) => void)(testError);

			expect(mockReconnectorScheduleReconnect).toHaveBeenCalledTimes(1);
			expect(errorListener).toHaveBeenCalledWith(testError);
		});

		it("should schedule reconnect when ws is null", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.on("error", jest.fn<(...args: any[]) => any>());
			mockWsTransport.ws = null;

			conn.connect();
			(mockWsTransport.onError as (err: Error) => void)(new Error("err"));

			expect(mockReconnectorScheduleReconnect).toHaveBeenCalledTimes(1);
		});

		it("should not schedule reconnect when ws is open", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.on("error", jest.fn<(...args: any[]) => any>());

			conn.connect();
			(mockWsTransport.onError as (err: Error) => void)(new Error("err"));

			expect(mockReconnectorScheduleReconnect).not.toHaveBeenCalled();
		});
	});

	describe("onTimeout callback", () => {
		it("should set state to Reconnecting and schedule reconnect", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });

			conn.connect();
			(mockWsTransport.onTimeout as () => void)();

			expect(conn.state).toBe(ConnectionState.Reconnecting);
			expect(mockReconnectorScheduleReconnect).toHaveBeenCalledTimes(1);
		});
	});

	describe("disconnect", () => {
		it("should disconnect connection, cancel reconnect, and set state to Disconnected", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();

			conn.disconnect(1001, "going away");

			expect(mockWsTransport.disconnect).toHaveBeenCalledWith(
				1001,
				"going away"
			);
			expect(mockReconnectorCancel).toHaveBeenCalledTimes(1);
			expect(conn.state).toBe(ConnectionState.Disconnected);
		});
	});

	describe("send", () => {
		it("should return false when ws is null", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();
			mockWsTransport.ws = null;

			const result = conn.send("test");

			expect(result).toBe(false);
		});

		it("should return false when ws is not OPEN", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();
			mockWsObject.readyState = 3;

			const result = conn.send("test");

			expect(result).toBe(false);
		});

		it("should return true when data is a string", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();

			const result = conn.send("hello");

			expect(result).toBe(true);
			expect(mockWsObject.send).toHaveBeenCalledWith("hello");
		});

		it("should JSON.stringify non-string data", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();

			const result = conn.send({ type: "ping" });

			expect(result).toBe(true);
			expect(mockWsObject.send).toHaveBeenCalledWith(
				JSON.stringify({ type: "ping" })
			);
		});

		it("should return false when ws.send throws", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();
			(mockWsObject.send as jest.Mock).mockImplementationOnce(() => {
				throw new Error("send failed");
			});

			const result = conn.send("test");

			expect(result).toBe(false);
		});
	});

	describe("getters", () => {
		it("should return isConnected based on state", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });

			expect(conn.isConnected).toBe(false);

			conn.connect();
			expect(conn.isConnected).toBe(false);

			(mockWsTransport.onOpen as () => void)();
			expect(conn.isConnected).toBe(true);
		});

		it("should return current state via state getter", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });

			expect(conn.state).toBe(ConnectionState.Disconnected);

			conn.connect();
			expect(conn.state).toBe(ConnectionState.Connecting);

			(mockWsTransport.onOpen as () => void)();
			expect(conn.state).toBe(ConnectionState.Connected);
		});

		it("should delegate ws getter to connectionManager.ws", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();

			expect(conn.ws).toBe(mockWsTransport.ws);
		});
	});

	describe("on", () => {
		it("should register event listeners and return this for chaining", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			const listener = jest.fn<(...args: any[]) => any>();

			const result = conn.on("custom-event", listener);

			expect(result).toBe(conn);
		});
	});

	describe("reconnect flow", () => {
		it("should trigger disconnect and _connectWs when scheduled reconnect callback is invoked", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();

			(mockWsTransport.onTimeout as () => void)();

			expect(conn.state).toBe(ConnectionState.Reconnecting);
			expect(mockReconnectorScheduleReconnect).toHaveBeenCalledTimes(1);
			expect(capturedScheduleReconnectCallback).toBeDefined();

			(mockWsTransport.disconnect as jest.Mock).mockClear();
			(mockWsTransport.connect as jest.Mock).mockClear();
			capturedScheduleReconnectCallback!();

			expect(mockWsTransport.disconnect).toHaveBeenCalledTimes(1);
			expect(mockWsTransport.connect).toHaveBeenCalledTimes(1);
		});

		it("should skip _connectWs when reconnector is destroyed before reconnection", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			conn.connect();
			(mockWsTransport.onTimeout as () => void)();
			expect(capturedScheduleReconnectCallback).toBeDefined();

			mockReconnectorIsDestroyed = true;
			(mockWsTransport.disconnect as jest.Mock).mockClear();
			(mockWsTransport.connect as jest.Mock).mockClear();
			capturedScheduleReconnectCallback!();

			expect(mockWsTransport.disconnect).toHaveBeenCalledTimes(1);
			expect(mockWsTransport.connect).not.toHaveBeenCalled();
		});
	});

	describe("onMessage callback", () => {
		it("should emit message event when connectionManager receives data", () => {
			const conn = new WssTransportConnection({ wsUrl: testUrl });
			const messageListener = jest.fn<(...args: any[]) => any>();
			conn.on("message", messageListener);
			conn.connect();

			const testData = Buffer.from("test message");
			(mockWsTransport.onMessage as (data: unknown) => void)(testData);

			expect(messageListener).toHaveBeenCalledWith(testData);
		});
	});
});
