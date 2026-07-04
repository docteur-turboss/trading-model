import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

jest.mock("ws", () => {
	const MockWebSocket = jest.fn(() => ({
		on: jest.fn(),
		send: jest.fn(),
		readyState: 1,
		close: jest.fn(),
	}));
	(MockWebSocket as any).OPEN = 1;
	(MockWebSocket as any).CONNECTING = 0;
	(MockWebSocket as any).CLOSING = 2;
	(MockWebSocket as any).CLOSED = 3;

	const MockWebSocketServer = jest.fn(() => ({
		on: jest.fn(),
		close: jest.fn(),
	}));

	return {
		__esModule: true,
		default: MockWebSocket,
		WebSocketServer: MockWebSocketServer,
	};
});

import { logger } from "@trading-model/common/config/logger";
import { WebSocketServer } from "ws";

import { WorkerProtocol } from "../../../src/worker/worker-protocol";
import type { WorkerRegistry } from "../../../src/worker/worker-registry";

const MOCK_WEB_SOCKET_SERVER = WebSocketServer as unknown as jest.Mock;

describe("WorkerProtocol", () => {
	let protocol: WorkerProtocol;
	let mockRegistry: jest.Mocked<WorkerRegistry>;
	let onWorkerDisconnect: jest.Mock;
	let wssInstance: any;
	let connectionHandler: (ws: any) => void;

	function createWs(overrides: Partial<{ readyState: number }> = {}) {
		return {
			on: jest.fn(),
			send: jest.fn(),
			readyState: 1,
			close: jest.fn(),
			...overrides,
		};
	}

	function simulateConnection(ws: any) {
		connectionHandler(ws);
	}

	function getMessageHandler(ws: any): jest.Mock {
		return (ws.on as jest.Mock).mock.calls.find(
			(c: any) => c[0] === "message"
		)![1] as unknown as jest.Mock;
	}

	function getCloseHandler(ws: any): jest.Mock {
		return (ws.on as jest.Mock).mock.calls.find(
			(c: any) => c[0] === "close"
		)![1] as unknown as jest.Mock;
	}

	beforeEach(() => {
		jest.clearAllMocks();

		mockRegistry = {
			register: jest.fn(),
			unregister: jest.fn(),
			heartbeat: jest.fn(),
			updateLoad: jest.fn(),
			setStatus: jest.fn(),
			get: jest.fn(),
			findBestWorker: jest.fn(),
			purgeStaleWorkers: jest.fn(),
			count: jest.fn(),
			averageLoad: jest.fn(),
			getAllActive: jest.fn(),
		} as unknown as jest.Mocked<WorkerRegistry>;

		onWorkerDisconnect = jest.fn();

		protocol = new WorkerProtocol({} as any, mockRegistry, onWorkerDisconnect);

		wssInstance = MOCK_WEB_SOCKET_SERVER.mock.results[0].value;
		connectionHandler = (wssInstance.on as jest.Mock).mock.calls.find(
			(c: any) => c[0] === "connection"
		)![1] as unknown as (ws: any) => void;
	});

	describe("constructor", () => {
		it("should create a WebSocketServer with the provided server", () => {
			expect(MOCK_WEB_SOCKET_SERVER).toHaveBeenCalledWith({ server: {} });
		});

		it("should register a connection handler on the WebSocketServer", () => {
			expect(wssInstance.on).toHaveBeenCalledWith(
				"connection",
				expect.any(Function)
			);
		});
	});

	describe("on connection", () => {
		it("should set up message and close handlers on the WebSocket", () => {
			const ws = createWs();

			simulateConnection(ws);

			expect(ws.on).toHaveBeenCalledWith("message", expect.any(Function));
			expect(ws.on).toHaveBeenCalledWith("close", expect.any(Function));
		});

		describe("message handling", () => {
			it("should handle register message", () => {
				const ws = createWs();
				simulateConnection(ws);
				const messageHandler = getMessageHandler(ws);

				messageHandler(
					JSON.stringify({
						type: "register",
						workerId: "w1",
						address: "10.0.0.1",
						port: 9000,
						capabilities: ["type-a"],
						maxConcurrency: 5,
					})
				);

				expect(mockRegistry.register).toHaveBeenCalledWith("w1", {
					workerId: "w1",
					address: "10.0.0.1",
					port: 9000,
					capabilities: ["type-a"],
					maxConcurrency: 5,
					currentLoad: 0,
				});
				expect(logger.info).toHaveBeenCalledWith(
					"Worker registered via WebSocket",
					{
						workerId: "w1",
					}
				);
			});

			it("should handle heartbeat message", () => {
				const ws = createWs();
				simulateConnection(ws);
				const messageHandler = getMessageHandler(ws);

				messageHandler(
					JSON.stringify({
						type: "register",
						workerId: "w1",
						address: "10.0.0.1",
						port: 9000,
						capabilities: ["type-a"],
						maxConcurrency: 5,
					})
				);

				jest.clearAllMocks();

				messageHandler(
					JSON.stringify({
						type: "heartbeat",
						workerId: "w1",
						currentLoad: 3,
					})
				);

				expect(mockRegistry.heartbeat).toHaveBeenCalledWith("w1");
				expect(mockRegistry.updateLoad).toHaveBeenCalledWith("w1", 3);
				expect(ws.send).toHaveBeenCalledWith(
					JSON.stringify({ type: "heartbeat.ack" })
				);
			});

			it("should not send heartbeat ack when connection is not OPEN", () => {
				const ws = createWs({ readyState: 2 });
				simulateConnection(ws);
				const messageHandler = getMessageHandler(ws);

				messageHandler(
					JSON.stringify({
						type: "register",
						workerId: "w1",
						address: "10.0.0.1",
						port: 9000,
						capabilities: [],
						maxConcurrency: 5,
					})
				);

				jest.clearAllMocks();

				messageHandler(
					JSON.stringify({
						type: "heartbeat",
						workerId: "w1",
						currentLoad: 1,
					})
				);

				expect(ws.send).not.toHaveBeenCalled();
			});

			it("should handle disconnect message", () => {
				const ws = createWs();
				simulateConnection(ws);
				const messageHandler = getMessageHandler(ws);

				messageHandler(
					JSON.stringify({
						type: "register",
						workerId: "w1",
						address: "10.0.0.1",
						port: 9000,
						capabilities: [],
						maxConcurrency: 5,
					})
				);

				jest.clearAllMocks();

				messageHandler(
					JSON.stringify({
						type: "disconnect",
						workerId: "w1",
						reason: "shutting down",
					})
				);

				expect(mockRegistry.unregister).toHaveBeenCalledWith("w1");
				expect(onWorkerDisconnect).toHaveBeenCalledWith("w1");
				expect(logger.info).toHaveBeenCalledWith("Worker disconnected", {
					workerId: "w1",
					reason: "shutting down",
				});
			});

			it("should log error on invalid JSON", () => {
				const ws = createWs();
				simulateConnection(ws);
				const messageHandler = getMessageHandler(ws);

				messageHandler("not-json");

				expect(logger.error).toHaveBeenCalledWith(
					"Invalid WebSocket message from worker",
					{
						error: expect.any(String),
					}
				);
			});

			it("should log error with String(err) when thrown value is not an Error", () => {
				const ws = createWs();
				simulateConnection(ws);
				const messageHandler = getMessageHandler(ws);

				messageHandler({
					toString: () => {
						throw new Error("primitive-error");
					},
				});

				expect(logger.error).toHaveBeenCalledWith(
					"Invalid WebSocket message from worker",
					{
						error: "primitive-error",
					}
				);
			});

			it("should do nothing for unknown message type", () => {
				const ws = createWs();
				simulateConnection(ws);
				const messageHandler = getMessageHandler(ws);

				messageHandler(JSON.stringify({ type: "unknown" }));

				expect(mockRegistry.register).not.toHaveBeenCalled();
				expect(mockRegistry.heartbeat).not.toHaveBeenCalled();
				expect(mockRegistry.unregister).not.toHaveBeenCalled();
			});
		});

		describe("close handling", () => {
			it("should mark worker as draining and call onWorkerDisconnect", () => {
				const ws = createWs();
				simulateConnection(ws);
				const messageHandler = getMessageHandler(ws);
				const closeHandler = getCloseHandler(ws);

				messageHandler(
					JSON.stringify({
						type: "register",
						workerId: "w1",
						address: "10.0.0.1",
						port: 9000,
						capabilities: ["type-a"],
						maxConcurrency: 5,
					})
				);

				jest.clearAllMocks();

				closeHandler();

				expect(mockRegistry.setStatus).toHaveBeenCalledWith("w1", "draining");
				expect(onWorkerDisconnect).toHaveBeenCalledWith("w1");
			});

			it("should do nothing when closing a non-registered connection", () => {
				const ws = createWs();
				simulateConnection(ws);
				const closeHandler = getCloseHandler(ws);

				closeHandler();

				expect(mockRegistry.setStatus).not.toHaveBeenCalled();
				expect(onWorkerDisconnect).not.toHaveBeenCalled();
			});

			it("should not match close for a different WebSocket than the one in the map", () => {
				const ws1 = createWs();
				simulateConnection(ws1);
				getMessageHandler(ws1)(
					JSON.stringify({
						type: "register",
						workerId: "w1",
						address: "10.0.0.1",
						port: 9000,
						capabilities: [],
						maxConcurrency: 5,
					})
				);

				const ws2 = createWs();
				simulateConnection(ws2);
				const closeHandler2 = getCloseHandler(ws2);

				jest.clearAllMocks();

				closeHandler2();

				expect(mockRegistry.setStatus).not.toHaveBeenCalled();
				expect(onWorkerDisconnect).not.toHaveBeenCalled();
			});
		});
	});

	describe("sendToWorker", () => {
		it("should send JSON message to the worker connection", () => {
			const ws = createWs();
			simulateConnection(ws);
			const messageHandler = getMessageHandler(ws);

			messageHandler(
				JSON.stringify({
					type: "register",
					workerId: "w1",
					address: "10.0.0.1",
					port: 9000,
					capabilities: [],
					maxConcurrency: 5,
				})
			);

			protocol.sendToWorker("w1", { type: "drain" });

			expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "drain" }));
		});

		it("should not send if worker connection does not exist", () => {
			const ws = createWs();
			simulateConnection(ws);

			protocol.sendToWorker("nonexistent", { type: "drain" });

			expect(ws.send).not.toHaveBeenCalled();
		});

		it("should not send if connection is not OPEN", () => {
			const ws = createWs({ readyState: 2 });
			simulateConnection(ws);
			const messageHandler = getMessageHandler(ws);

			messageHandler(
				JSON.stringify({
					type: "register",
					workerId: "w1",
					address: "10.0.0.1",
					port: 9000,
					capabilities: [],
					maxConcurrency: 5,
				})
			);

			protocol.sendToWorker("w1", { type: "drain" });

			expect(ws.send).not.toHaveBeenCalled();
		});
	});

	describe("sendDrain", () => {
		it("should call sendToWorker with drain type", () => {
			jest.spyOn(protocol, "sendToWorker");

			protocol.sendDrain("w1");

			expect(protocol.sendToWorker).toHaveBeenCalledWith("w1", {
				type: "drain",
			});
		});
	});

	describe("broadcastDrain", () => {
		it("should call sendDrain for all connections", () => {
			jest.spyOn(protocol, "sendDrain");

			const ws1 = createWs();
			simulateConnection(ws1);
			getMessageHandler(ws1)(
				JSON.stringify({
					type: "register",
					workerId: "w1",
					address: "10.0.0.1",
					port: 9000,
					capabilities: [],
					maxConcurrency: 5,
				})
			);

			const ws2 = createWs();
			simulateConnection(ws2);
			getMessageHandler(ws2)(
				JSON.stringify({
					type: "register",
					workerId: "w2",
					address: "10.0.0.2",
					port: 9000,
					capabilities: [],
					maxConcurrency: 5,
				})
			);

			jest.clearAllMocks();

			protocol.broadcastDrain();

			expect(protocol.sendDrain).toHaveBeenCalledWith("w1");
			expect(protocol.sendDrain).toHaveBeenCalledWith("w2");
		});
	});

	describe("close", () => {
		it("should broadcast drain, close all connections, clear map, and close server", () => {
			jest.spyOn(protocol, "broadcastDrain");

			const ws1 = createWs();
			simulateConnection(ws1);
			getMessageHandler(ws1)(
				JSON.stringify({
					type: "register",
					workerId: "w1",
					address: "10.0.0.1",
					port: 9000,
					capabilities: [],
					maxConcurrency: 5,
				})
			);

			const ws2 = createWs();
			simulateConnection(ws2);
			getMessageHandler(ws2)(
				JSON.stringify({
					type: "register",
					workerId: "w2",
					address: "10.0.0.2",
					port: 9000,
					capabilities: [],
					maxConcurrency: 5,
				})
			);

			jest.clearAllMocks();

			protocol.close();

			expect(protocol.broadcastDrain).toHaveBeenCalledTimes(1);
			expect(ws1.close).toHaveBeenCalledTimes(1);
			expect(ws2.close).toHaveBeenCalledTimes(1);
			expect(wssInstance.close).toHaveBeenCalledTimes(1);
		});
	});
});
