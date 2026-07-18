import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import {
	DurationMs,
	FilePath,
	URLString,
} from "@trading-model/common/domain/primitives";

const mockWsHandlers = new Map<string, (...args: unknown[]) => void>();
const mockWsInstance: Record<string, unknown> = {
	readyState: 1,
	binaryType: "",
	on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
		mockWsHandlers.set(event, handler);
	}),
	close: jest.fn(),
	removeAllListeners: jest.fn(),
	send: jest.fn(),
};

const MockWebSocket = jest.fn(() => mockWsInstance) as jest.Mock & {
	OPEN: number;
	CLOSED: number;
};
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;

jest.mock("ws", () => ({
	__esModule: true,
	default: MockWebSocket,
}));

let capturedTimeoutCallback: (() => void) | undefined;
const mockCancelTimeout = jest.fn();
jest.mock("@trading-model/common/utils/ws-reconnect", () => ({
	createWsConnectTimeout: jest.fn(
		(onTimeout: () => void, _timeoutMs?: DurationMs) => {
			capturedTimeoutCallback = onTimeout;
			return mockCancelTimeout;
		}
	),
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		debug: jest.fn(),
		info: jest.fn(),
		error: jest.fn(),
		warn: jest.fn(),
	},
}));

jest.mock("../../src/tls-config-builder", () => ({
	buildTlsConfig: jest.fn(() => ({})),
}));

import { logger } from "@trading-model/common/config/logger";
import { createWsConnectTimeout } from "@trading-model/common/utils/ws-reconnect";
import { buildTlsConfig } from "../../src/tls-config-builder";
import { WsTransport } from "../../src/ws-transport";

describe("WsTransport", () => {
	const testUrl = URLString.of("wss://example.com:8443");
	let transport: WsTransport;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		mockWsHandlers.clear();
		mockWsInstance.readyState = MockWebSocket.OPEN;
		capturedTimeoutCallback = undefined;
		transport = new WsTransport({ url: testUrl });
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("connect", () => {
		it("should create a WebSocket with the given URL and TLS options", () => {
			transport.connect();
			expect(MockWebSocket).toHaveBeenCalledWith(testUrl, {});
			expect(mockWsInstance.binaryType).toBe("nodebuffer");
		});

		it("should register event handlers for open, message, close, and error", () => {
			transport.connect();
			expect(mockWsInstance.on).toHaveBeenCalledWith(
				"open",
				expect.any(Function)
			);
			expect(mockWsInstance.on).toHaveBeenCalledWith(
				"message",
				expect.any(Function)
			);
			expect(mockWsInstance.on).toHaveBeenCalledWith(
				"close",
				expect.any(Function)
			);
			expect(mockWsInstance.on).toHaveBeenCalledWith(
				"error",
				expect.any(Function)
			);
		});

		it("should create a connect timeout", () => {
			transport.connect();
			expect(createWsConnectTimeout).toHaveBeenCalledWith(
				expect.any(Function),
				DurationMs.of(10_000)
			);
		});

		it("should call buildTlsConfig with the provided TLS config", () => {
			const tlsPaths = {
				caPath: FilePath.of("/etc/tls/ca.pem"),
				certPath: FilePath.of("/etc/tls/cert.pem"),
				keyPath: FilePath.of("/etc/tls/key.pem"),
			};
			transport = new WsTransport({ url: testUrl, tlsConfig: tlsPaths });
			transport.connect();
			expect(buildTlsConfig).toHaveBeenCalledWith(tlsPaths);
		});
	});

	describe("onOpen", () => {
		it("should trigger the onOpen callback when the WebSocket open event fires", () => {
			transport.onOpen = jest.fn();
			transport.connect();

			const openHandler = mockWsHandlers.get("open");
			openHandler!();

			expect(transport.onOpen).toHaveBeenCalled();
		});

		it("should cancel the connect timeout on open", () => {
			transport.onOpen = jest.fn();
			transport.connect();

			const openHandler = mockWsHandlers.get("open");
			openHandler!();

			expect(mockCancelTimeout).toHaveBeenCalled();
		});
	});

	describe("onMessage", () => {
		it("should trigger the onMessage callback with the received data", () => {
			transport.onMessage = jest.fn();
			transport.connect();

			const messageHandler = mockWsHandlers.get("message");
			const testData = Buffer.from("hello");
			messageHandler!(testData);

			expect(transport.onMessage).toHaveBeenCalledWith(testData);
		});
	});

	describe("onCloseHandler", () => {
		it("should trigger the onCloseHandler callback when the WebSocket close event fires", () => {
			transport.onCloseHandler = jest.fn();
			transport.connect();

			const closeHandler = mockWsHandlers.get("close");
			closeHandler!();

			expect(transport.onCloseHandler).toHaveBeenCalled();
		});

		it("should cancel the connect timeout on close", () => {
			transport.onCloseHandler = jest.fn();
			transport.connect();

			const closeHandler = mockWsHandlers.get("close");
			closeHandler!();

			expect(mockCancelTimeout).toHaveBeenCalled();
		});
	});

	describe("onError", () => {
		it("should trigger the onError callback with the error", () => {
			transport.onError = jest.fn();
			transport.connect();

			const errorHandler = mockWsHandlers.get("error");
			const testError = new Error("connection refused");
			errorHandler!(testError);

			expect(transport.onError).toHaveBeenCalledWith(testError);
		});

		it("should log the error and cancel the timeout on error", () => {
			transport.onError = jest.fn();
			transport.connect();

			const errorHandler = mockWsHandlers.get("error");
			errorHandler!(new Error("test"));

			expect(logger.error).toHaveBeenCalledWith("WSS transport error", {
				err: "test",
			});
			expect(mockCancelTimeout).toHaveBeenCalled();
		});
	});

	describe("onTimeout", () => {
		it("should trigger the onTimeout callback when the connect timeout fires", () => {
			transport.onTimeout = jest.fn();
			transport.connect();

			expect(capturedTimeoutCallback).toBeDefined();
			capturedTimeoutCallback!();

			expect(transport.onTimeout).toHaveBeenCalled();
		});

		it("should close the WebSocket and log a warning on timeout", () => {
			transport.onTimeout = jest.fn();
			transport.connect();

			capturedTimeoutCallback!();

			expect(logger.warn).toHaveBeenCalledWith("WSS connection timeout");
			expect(mockWsInstance.close).toHaveBeenCalled();
		});

		it("should trigger onTimeout when the WebSocket constructor throws", () => {
			MockWebSocket.mockImplementationOnce(() => {
				throw new Error("constructor failed");
			});
			transport.onTimeout = jest.fn();
			transport.connect();

			expect(logger.error).toHaveBeenCalledWith(
				"Failed to create WSS connection",
				{ err: new Error("constructor failed") }
			);
			expect(transport.onTimeout).toHaveBeenCalled();
		});
	});

	describe("disconnect", () => {
		it("should remove all listeners and close the WebSocket", () => {
			transport.connect();
			transport.disconnect(1001, "going away");

			expect(mockWsInstance.removeAllListeners).toHaveBeenCalled();
			expect(mockWsInstance.close).toHaveBeenCalledWith(1001, "going away");
		});

		it("should not throw when called without an active connection", () => {
			expect(() => transport.disconnect()).not.toThrow();
		});

		it("should call close without arguments by default", () => {
			transport.connect();
			transport.disconnect();

			expect(mockWsInstance.close).toHaveBeenCalledWith(undefined, undefined);
		});

		it("should handle close throwing an error", () => {
			transport.connect();
			(mockWsInstance.close as jest.Mock).mockImplementationOnce(() => {
				throw new Error("close error");
			});
			expect(() => transport.disconnect()).not.toThrow();
		});
	});

	describe("send", () => {
		it("should return false when not connected", () => {
			const result = transport.send("test");
			expect(result).toBe(false);
		});

		it("should return true and send string data when connected and ws is OPEN", () => {
			transport.onOpen = jest.fn();
			transport.connect();
			mockWsHandlers.get("open")!();
			mockWsInstance.readyState = MockWebSocket.OPEN;

			const result = transport.send("hello");
			expect(result).toBe(true);
			expect(mockWsInstance.send).toHaveBeenCalledWith("hello");
		});

		it("should JSON.stringify non-string data before sending", () => {
			transport.onOpen = jest.fn();
			transport.connect();
			mockWsHandlers.get("open")!();
			mockWsInstance.readyState = MockWebSocket.OPEN;

			const data = { type: "ping" };
			const result = transport.send(data);
			expect(result).toBe(true);
			expect(mockWsInstance.send).toHaveBeenCalledWith(
				JSON.stringify({ type: "ping" })
			);
		});

		it("should return false when readyState is not OPEN", () => {
			transport.connect();
			mockWsInstance.readyState = MockWebSocket.CLOSED;

			const result = transport.send("test");
			expect(result).toBe(false);
		});

		it("should return false when ws.send throws", () => {
			transport.onOpen = jest.fn();
			transport.connect();
			mockWsHandlers.get("open")!();
			mockWsInstance.readyState = MockWebSocket.OPEN;
			(mockWsInstance.send as jest.Mock).mockImplementationOnce(() => {
				throw new Error("send failed");
			});

			const result = transport.send("test");
			expect(result).toBe(false);
		});
	});

	describe("isConnected", () => {
		it("should return false when no WebSocket has been created", () => {
			expect(transport.isConnected).toBe(false);
		});

		it("should return true when readyState is OPEN", () => {
			transport.connect();
			mockWsInstance.readyState = MockWebSocket.OPEN;

			expect(transport.isConnected).toBe(true);
		});

		it("should return false when readyState is not OPEN", () => {
			transport.connect();
			mockWsInstance.readyState = MockWebSocket.CLOSED;

			expect(transport.isConnected).toBe(false);
		});

		it("should return false when readyState access throws", () => {
			transport.connect();
			const origReadyState = mockWsInstance.readyState;
			Object.defineProperty(mockWsInstance, "readyState", {
				get: () => {
					throw new Error("access error");
				},
				configurable: true,
			});
			expect(transport.isConnected).toBe(false);
			delete (mockWsInstance as any).readyState;
			mockWsInstance.readyState = origReadyState;
		});
	});

	describe("ws getter", () => {
		it("should return the underlying WebSocket instance", () => {
			transport.connect();
			expect(transport.ws).toBe(mockWsInstance);
		});

		it("should return null before connect is called", () => {
			expect(transport.ws).toBeNull();
		});
	});
});
