import EventEmitter from "node:events";
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

interface WsHandlers {
	message: ((data: string) => void) | null;
	close: (() => void) | null;
	error: ((err: Error) => void) | null;
}

interface MockWs {
	on: jest.Mock;
	send: jest.Mock;
	close: jest.Mock;
	readyState: number;
	handlers: WsHandlers;
}

function createMockWs(): MockWs {
	const handlers: WsHandlers = { message: null, close: null, error: null };
	const ws: MockWs = {
		on: jest.fn().mockImplementation((event: string, handler: any) => {
			if (event === "message") {
				handlers.message = handler;
			}
			if (event === "close") {
				handlers.close = handler;
			}
			if (event === "error") {
				handlers.error = handler;
			}
			return ws;
		}),
		send: jest.fn(),
		close: jest.fn(),
		readyState: 1,
		handlers,
	};
	return ws;
}

function createMockWss() {
	let connectionHandler: ((ws: MockWs, req: any) => void) | null = null;
	return {
		on: jest.fn().mockImplementation((event: string, handler: any) => {
			if (event === "connection") {
				connectionHandler = handler;
			}
		}),
		handleUpgrade: jest.fn(),
		emit: jest.fn(),
		close: jest.fn(),
		getConnectionHandler: () => connectionHandler,
	};
}

jest.mock("ws", () => ({
	__esModule: true,
	default: { OPEN: 1 },
	WebSocket: { OPEN: 1 },
	WebSocketServer: jest.fn(),
}));

import { WebSocketServer } from "ws";
import { WsDiscoveryServer } from "../../src/core/ws-discovery-server";

const MOCK_WEB_SOCKET_SERVER = WebSocketServer as unknown as jest.Mock;
const CREATED_SERVERS: Array<{
	server: WsDiscoveryServer;
	wss: ReturnType<typeof createMockWss>;
}> = [];

function makeConnection(): { server: WsDiscoveryServer; ws: MockWs } {
	const ws = createMockWs();
	const mockWss = createMockWss();
	MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
	const mockServer = new EventEmitter();
	const server = new WsDiscoveryServer();
	server.attach(mockServer as any);
	const connHandler = mockWss.getConnectionHandler();
	connHandler!(ws, {
		socket: { remoteAddress: "127.0.0.1", remotePort: 12345 },
	});
	CREATED_SERVERS.push({ server, wss: mockWss });
	return { server, ws };
}

describe("WsDiscoveryServer", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	afterEach(() => {
		for (const s of CREATED_SERVERS) {
			s.server.stop(s.wss);
		}
		CREATED_SERVERS.length = 0;
	});

	describe("attach", () => {
		it("should create WebSocketServer with noServer option", () => {
			const mockWss = createMockWss();
			MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
			new WsDiscoveryServer().attach(new EventEmitter() as any);
			expect(MOCK_WEB_SOCKET_SERVER).toHaveBeenCalledWith({ noServer: true });
		});

		it("should handle upgrade when path matches", () => {
			const mockWss = createMockWss();
			mockWss.handleUpgrade = jest
				.fn()
				.mockImplementation((req, _socket, _head, cb) => {
					cb(createMockWs(), req);
				});
			MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
			const server = new WsDiscoveryServer();
			const mockServer = new EventEmitter();
			server.attach(mockServer as any);
			const upgradeHandler = mockServer.listeners("upgrade")[0] as (
				req: any,
				socket: any,
				head: any
			) => void;
			upgradeHandler({ url: "/ws" } as any, {} as any, Buffer.alloc(0));
			expect(mockWss.handleUpgrade).toHaveBeenCalled();
			expect(mockWss.emit).toHaveBeenCalledWith(
				"connection",
				expect.any(Object),
				expect.any(Object)
			);
			server.stop(mockWss);
		});

		it("should not handle upgrade when path does not match", () => {
			const mockWss = createMockWss();
			MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
			const server = new WsDiscoveryServer();
			const mockServer = new EventEmitter();
			server.attach(mockServer as any);
			const upgradeHandler = mockServer.listeners("upgrade")[0] as (
				req: any,
				socket: any,
				head: any
			) => void;
			upgradeHandler({ url: "/other" } as any, {} as any, Buffer.alloc(0));
			expect(mockWss.handleUpgrade).not.toHaveBeenCalled();
		});

		it("should set up connection handler with client tracking", () => {
			const mockWss = createMockWss();
			MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
			new WsDiscoveryServer().attach(new EventEmitter() as any);
			expect(mockWss.on).toHaveBeenCalledWith(
				"connection",
				expect.any(Function)
			);
		});

		it("should register ws event handlers on connection", () => {
			const { ws } = makeConnection();
			expect(ws.on).toHaveBeenCalledWith("message", expect.any(Function));
			expect(ws.on).toHaveBeenCalledWith("close", expect.any(Function));
			expect(ws.on).toHaveBeenCalledWith("error", expect.any(Function));
		});

		it("should log client disconnect", () => {
			const { ws } = makeConnection();
			const { logger } = require("@trading-model/common/config/logger");
			ws.handlers.close!();
			expect(logger.info).toHaveBeenCalledWith(
				"Discovery WS client disconnected",
				expect.any(Object)
			);
		});

		it("should handle close without timeout in map", () => {
			const { logger } = require("@trading-model/common/config/logger");
			const { server, ws } = makeConnection();
			(server as any)._clientManager.clearAll();
			ws.handlers.close!();
			expect(logger.info).toHaveBeenCalledWith(
				"Discovery WS client disconnected",
				expect.any(Object)
			);
		});

		it("should log client errors", () => {
			const { logger } = require("@trading-model/common/config/logger");
			const { ws } = makeConnection();
			ws.handlers.error!(new Error("WS error"));
			expect(logger.warn).toHaveBeenCalledWith(
				"Discovery WS client error",
				expect.any(Object)
			);
		});

		it("should log warning on unparseable message", () => {
			const { logger } = require("@trading-model/common/config/logger");
			const { ws } = makeConnection();
			ws.handlers.message!("not-json");
			expect(logger.warn).toHaveBeenCalledWith(
				"Failed to parse WS message",
				expect.any(Object)
			);
		});
	});

	describe("handleMessage", () => {
		it("should subscribe with services array", () => {
			const { logger } = require("@trading-model/common/config/logger");
			const { ws } = makeConnection();
			ws.handlers.message!(
				JSON.stringify({
					type: "subscribe",
					payload: { services: ["financial-scraper-service"] },
				})
			);
			expect(logger.info).toHaveBeenCalledWith(
				"Discovery WS client subscribed",
				expect.objectContaining({
					services: ["financial-scraper-service"],
				})
			);
		});

		it("should subscribe with wildcard when no services array", () => {
			const { server, ws } = makeConnection();
			ws.handlers.message!(JSON.stringify({ type: "subscribe", payload: {} }));
			server.notifyServiceChanged("any-service");
			expect(ws.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "cache.invalidate",
					payload: { serviceName: "any-service" },
				})
			);
		});

		it("should handle heartbeat message", () => {
			const { server, ws } = makeConnection();
			ws.handlers.message!(
				JSON.stringify({
					type: "subscribe",
					payload: { services: ["financial-scraper-service"] },
				})
			);
			ws.handlers.message!(
				JSON.stringify({
					type: "heartbeat",
					payload: {
						serviceName: "financial-scraper-service",
						instanceId: "i1",
					},
				})
			);
			server.notifyServiceChanged("financial-scraper-service");
			expect(ws.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "cache.invalidate",
					payload: { serviceName: "financial-scraper-service" },
				})
			);
		});

		it("should log debug for unknown message type", () => {
			const { logger } = require("@trading-model/common/config/logger");
			const { ws } = makeConnection();
			ws.handlers.message!(JSON.stringify({ type: "unknown-type" }));
			expect(logger.debug).toHaveBeenCalledWith(
				"Unknown WS message type",
				expect.any(Object)
			);
		});

		it("should handle heartbeat with no payload fields", () => {
			const { server, ws } = makeConnection();
			ws.handlers.message!(
				JSON.stringify({
					type: "subscribe",
					payload: { services: ["financial-scraper-service"] },
				})
			);
			ws.handlers.message!(
				JSON.stringify({
					type: "heartbeat",
					payload: {},
				})
			);
			server.notifyServiceChanged("financial-scraper-service");
			expect(ws.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "cache.invalidate",
					payload: { serviceName: "financial-scraper-service" },
				})
			);
		});

		it("should handle heartbeat with missing payload", () => {
			const { server, ws } = makeConnection();
			ws.handlers.message!(
				JSON.stringify({
					type: "subscribe",
					payload: { services: ["financial-scraper-service"] },
				})
			);
			ws.handlers.message!(JSON.stringify({ type: "heartbeat" }));
			server.notifyServiceChanged("financial-scraper-service");
			expect(ws.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "cache.invalidate",
					payload: { serviceName: "financial-scraper-service" },
				})
			);
		});
	});

	describe("notifyServiceChanged", () => {
		it("should broadcast invalidation to subscribed clients", () => {
			const { server, ws } = makeConnection();
			ws.handlers.message!(
				JSON.stringify({
					type: "subscribe",
					payload: { services: ["financial-scraper-service"] },
				})
			);
			ws.send.mockClear();
			server.notifyServiceChanged("financial-scraper-service");
			expect(ws.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "cache.invalidate",
					payload: { serviceName: "financial-scraper-service" },
				})
			);
		});

		it("should not broadcast to clients not subscribed to the service", () => {
			const { server, ws } = makeConnection();
			ws.handlers.message!(
				JSON.stringify({
					type: "subscribe",
					payload: { services: ["other-service"] },
				})
			);
			ws.send.mockClear();
			server.notifyServiceChanged("financial-scraper-service");
			expect(ws.send).not.toHaveBeenCalled();
		});

		it("should skip clients with non-OPEN readyState", () => {
			const mockWss = createMockWss();
			MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
			const mockServer = new EventEmitter();
			const server = new WsDiscoveryServer();
			server.attach(mockServer as any);
			const ws = createMockWs();
			ws.readyState = 2;
			mockWss.getConnectionHandler()!(ws, {
				socket: { remoteAddress: "127.0.0.1", remotePort: 12345 },
			});
			ws.handlers.message!(JSON.stringify({ type: "subscribe", payload: {} }));
			ws.send.mockClear();
			server.notifyServiceChanged("financial-scraper-service");
			expect(ws.send).not.toHaveBeenCalled();
			server.stop(mockWss);
		});

		it("should log warning when send fails", () => {
			const { logger } = require("@trading-model/common/config/logger");
			const { server, ws } = makeConnection();
			ws.handlers.message!(
				JSON.stringify({ type: "subscribe", payload: { services: ["*"] } })
			);
			ws.send.mockImplementation(() => {
				throw new Error("Send failed");
			});
			server.notifyServiceChanged("financial-scraper-service");
			expect(logger.warn).toHaveBeenCalledWith(
				"Failed to send message to client",
				expect.any(Object)
			);
		});
	});

	describe("notifyInstanceRemoved", () => {
		it("should broadcast invalidation", () => {
			const { server, ws } = makeConnection();
			ws.handlers.message!(
				JSON.stringify({
					type: "subscribe",
					payload: { services: ["financial-scraper-service"] },
				})
			);
			ws.send.mockClear();
			server.notifyInstanceRemoved("financial-scraper-service", "i1");
			expect(ws.send).toHaveBeenCalledWith(
				JSON.stringify({
					type: "cache.invalidate",
					payload: { serviceName: "financial-scraper-service" },
				})
			);
		});
	});

	describe("stop", () => {
		it("should close all clients, clear maps, and close the server", () => {
			const mockWss = createMockWss();
			MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
			const server = new WsDiscoveryServer();
			server.attach(new EventEmitter() as any);
			const ws = createMockWs();
			mockWss.getConnectionHandler()!(ws, {
				socket: { remoteAddress: "127.0.0.1", remotePort: 12345 },
			});
			server.stop(mockWss);
			expect(ws.close).toHaveBeenCalled();
			expect(mockWss.close).toHaveBeenCalled();
		});

		it("should be safe to call multiple times", () => {
			const mockWss = createMockWss();
			MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
			const server = new WsDiscoveryServer();
			server.attach(new EventEmitter() as any);
			server.stop(mockWss);
			server.stop(mockWss);
			expect(mockWss.close).toHaveBeenCalledTimes(2);
		});

		it("should handle client without timeout in stop", () => {
			const mockWss = createMockWss();
			MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
			const server = new WsDiscoveryServer();
			server.attach(new EventEmitter() as any);
			const ws = createMockWs();
			mockWss.getConnectionHandler()!(ws, {
				socket: { remoteAddress: "127.0.0.1", remotePort: 12345 },
			});
			(server as any)._clientManager.clearAll();
			expect(ws.close).toHaveBeenCalled();
		});
	});

	describe("client timeout", () => {
		beforeEach(() => {
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it("should close client on timeout after 60s", () => {
			const { ws } = makeConnection();
			jest.advanceTimersByTime(60000);
			expect(ws.close).toHaveBeenCalled();
		});

		it("should clean up client timeout on close", () => {
			const { logger } = require("@trading-model/common/config/logger");
			const { ws } = makeConnection();
			ws.handlers.close!();
			jest.advanceTimersByTime(60000);
			expect(logger.warn).not.toHaveBeenCalledWith(
				"Discovery WS client timed out",
				expect.any(Object)
			);
		});

		it("should reset client timeout on each message", () => {
			const { server, ws } = makeConnection();
			(server as any)._clientManager.resetTimeout("127.0.0.1:12345", ws);
			jest.advanceTimersByTime(120000);
			expect(ws.close).toHaveBeenCalled();
		});
	});

	describe("default path", () => {
		it("should use /ws as default path", () => {
			const mockWss = createMockWss();
			MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
			const server = new WsDiscoveryServer();
			const mockServer = new EventEmitter();
			server.attach(mockServer as any);
			const upgradeHandler = mockServer.listeners("upgrade")[0] as (
				req: any,
				socket: any,
				head: any
			) => void;
			upgradeHandler({ url: "/ws" } as any, {} as any, Buffer.alloc(0));
			expect(mockWss.handleUpgrade).toHaveBeenCalled();
		});

		it("should use custom path when provided", () => {
			const mockWss = createMockWss();
			MOCK_WEB_SOCKET_SERVER.mockImplementation(() => mockWss);
			const server = new WsDiscoveryServer({ path: "/custom-ws" });
			const mockServer = new EventEmitter();
			server.attach(mockServer as any);
			const upgradeHandler = mockServer.listeners("upgrade")[0] as (
				req: any,
				socket: any,
				head: any
			) => void;
			upgradeHandler({ url: "/custom-ws" } as any, {} as any, Buffer.alloc(0));
			expect(mockWss.handleUpgrade).toHaveBeenCalled();
		});
	});
});
