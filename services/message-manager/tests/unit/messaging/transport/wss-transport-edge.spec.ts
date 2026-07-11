import type { IncomingMessage } from "node:http";
import type { Server as HttpsServer } from "node:https";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { WssTransport } from "../../../../src/messaging/transport/wss-transport";
import { createMockDispatcher } from "../../../helpers/broker.helper";

jest.mock("../../../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../../src/config/env", () => ({
	ENV: {
		MAX_PAYLOAD_BYTES: 5 * 1024 * 1024,
		BROKER_INSTANCE_ID: "test-broker",
		REDIS_PREFIX: "mm:",
	},
}));

jest.mock("../../../../src/config/redis", () => {
	const set = jest.fn<() => Promise<string | null>>().mockResolvedValue("OK");
	return { getStreamClient: jest.fn().mockResolvedValue({ set }) };
});

jest.mock("../../../../src/messaging/core/acl", () => {
	const authorizeTopic = jest
		.fn<() => Promise<{ allowed: boolean; reason?: string }>>()
		.mockResolvedValue({ allowed: true });
	return { authorizeTopic };
});

let connectionHandler:
	| ((ws: Record<string, unknown>, req: IncomingMessage) => void)
	| null = null;

jest.mock("ws", () => {
	const EventEmitter = require("node:events");
	const WebSocketMock = { OPEN: 1, CONNECTING: 0 };
	return {
		__esModule: true,
		default: WebSocketMock,
		WebSocketServer: jest.fn().mockImplementation(() => {
			const wss = new EventEmitter();
			wss.on = jest.fn(
				(event: string, handler: (...args: unknown[]) => void) => {
					if (event === "connection") {
						connectionHandler = handler as (
							ws: Record<string, unknown>,
							req: IncomingMessage
						) => void;
					}
					EventEmitter.prototype.on.call(wss, event, handler);
				}
			);
			wss.clients = new Set();
			wss.close = jest.fn((cb?: () => void) => {
				if (cb) {
					cb();
				}
			});
			return wss;
		}),
		WebSocket: WebSocketMock,
	};
});

function createMockWs(): Record<string, unknown> {
	const handlers: Record<string, (...args: unknown[]) => void> = {};
	return {
		readyState: 1,
		send: jest.fn(),
		close: jest.fn(),
		removeAllListeners: jest.fn(),
		on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
			handlers[event] = handler;
		}),
		emit(event: string, ...args: unknown[]) {
			if (handlers[event]) {
				handlers[event](...args);
			}
		},
		_handlers: handlers,
	};
}

function createMockReq(headers: Record<string, string>): IncomingMessage {
	return {
		headers: {
			"x-service-name": "test-service",
			"x-instance-id": "inst-1",
			...headers,
		},
	} as unknown as IncomingMessage;
}

describe("WssTransport edge", () => {
	let transport: WssTransport;
	let mockDispatcher: ReturnType<typeof createMockDispatcher>;
	let mockServer: HttpsServer;

	beforeEach(() => {
		connectionHandler = null;
		mockDispatcher = createMockDispatcher();
		mockDispatcher.getBackpressureRatio = jest
			.fn<() => number>()
			.mockReturnValue(0.5);
		mockDispatcher.publish = jest
			.fn<() => Promise<string>>()
			.mockResolvedValue("msg-1");
		mockDispatcher.handleAck = jest
			.fn<() => Promise<void>>()
			.mockResolvedValue(undefined);
		mockDispatcher.handleNack = jest
			.fn<() => Promise<void>>()
			.mockResolvedValue(undefined);

		transport = new WssTransport(mockDispatcher);
		mockServer = {
			on: jest.fn(),
			removeListener: jest.fn(),
		} as unknown as HttpsServer;
	});

	afterEach(async () => {
		await transport.shutdown();
	});

	it("should handle publish with ACL denying but no topic", async () => {
		const authorizeTopic =
			require("../../../../src/messaging/core/acl").authorizeTopic;
		(authorizeTopic as jest.Mock).mockResolvedValue({
			allowed: false,
			reason: "denied",
		});

		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;
		await msgHandler(
			Buffer.from(
				JSON.stringify({
					type: "publish",
					payload: { hello: "world" },
					metadata: { notopic: true },
				})
			)
		);

		expect(mockDispatcher.publish).toHaveBeenCalled();
	});

	it("should skip publish when dedup Redis returns null", async () => {
		const setMock = jest
			.fn<() => Promise<string | null>>()
			.mockResolvedValue(null);

		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const { getStreamClient } = require("../../../../src/config/redis");
		(getStreamClient as jest.Mock).mockResolvedValue({ set: setMock });

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;
		await msgHandler(
			Buffer.from(
				JSON.stringify({
					type: "publish",
					payload: { hello: "world" },
					metadata: {
						topic: "test.topic",
						delivery: { deduplicationId: "dedup-null-2" },
					},
				})
			)
		);

		expect(mockDispatcher.publish).not.toHaveBeenCalled();
	});

	it("should handle handler error gracefully", async () => {
		mockDispatcher.publish = jest
			.fn<() => Promise<string>>()
			.mockRejectedValue(new Error("handler crash"));

		transport = new WssTransport(mockDispatcher);
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;
		await msgHandler(
			Buffer.from(
				JSON.stringify({
					type: "publish",
					payload: { hello: "world" },
					metadata: { topic: "test.topic" },
				})
			)
		);

		expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining("error"));
	});

	it("should handle broadcast send failure", () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(
			mockWs,
			createMockReq({ "x-subscribed-topics": "topic.a" })
		);

		(mockWs.send as jest.Mock).mockImplementation(() => {
			throw new Error("send fail");
		});

		transport.broadcastToTopic("topic.a", { data: 1 });
		transport.broadcast({ type: "test" });
	});

	it("should handle connection at max capacity", () => {
		transport.attach(mockServer);
		for (let i = 0; i < 10000; i++) {
			const mockWs = createMockWs();
			connectionHandler!(
				mockWs,
				createMockReq({
					"x-service-name": `svc-${i}`,
					"x-instance-id": `inst-${i}`,
				})
			);
		}
		expect(transport.getConnectedCount()).toBe(10000);

		const overflowWs = createMockWs();
		connectionHandler!(
			overflowWs,
			createMockReq({
				"x-service-name": "overflow",
				"x-instance-id": "overflow",
			})
		);
		expect(transport.getConnectedCount()).toBe(10000);
		expect(overflowWs.close).toHaveBeenCalled();
	});
});
