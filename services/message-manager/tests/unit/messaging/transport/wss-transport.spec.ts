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
import type { Dispatcher } from "../../../../src/messaging/core/dispatcher";
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
	return {
		getStreamClient: jest.fn().mockResolvedValue({ set }),
	};
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
let verifyClientHandler:
	| ((
			info: { req: IncomingMessage },
			cb: (result: boolean, code?: number, message?: string) => void
	  ) => void)
	| null = null;

jest.mock("ws", () => {
	const EventEmitter = require("node:events");
	const WebSocketMock = {
		OPEN: 1,
		CONNECTING: 0,
	};
	return {
		__esModule: true,
		default: WebSocketMock,
		WebSocketServer: jest
			.fn()
			.mockImplementation(
				(options: {
					verifyClient?: (
						info: { req: IncomingMessage },
						cb: (result: boolean) => void
					) => void;
				}) => {
					verifyClientHandler = options.verifyClient ?? null;
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
					wss.close = jest.fn((cb?: () => void) => {
						if (cb) {
							cb();
						}
					});
					return wss;
				}
			),
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

describe("WssTransport", () => {
	let transport: WssTransport;
	let mockDispatcher: jest.Mocked<Dispatcher>;
	let mockServer: HttpsServer;

	beforeEach(() => {
		connectionHandler = null;
		verifyClientHandler = null;

		mockDispatcher = createMockDispatcher();
		mockDispatcher.getBackpressureRatio = jest
			.fn<() => number>()
			.mockReturnValue(0.5);
		mockDispatcher.publish = jest
			.fn<() => Promise<string>>()
			.mockResolvedValue("msg-1");
		mockDispatcher.handleAck = jest
			.fn<(messageId: string, instanceId: string) => Promise<void>>()
			.mockResolvedValue(undefined);
		mockDispatcher.handleNack = jest
			.fn<(messageId: string, instanceId: string) => Promise<void>>()
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

	it("should create instance without server", () => {
		expect(transport).toBeInstanceOf(WssTransport);
		expect(transport.getConnectedCount()).toBe(0);
	});

	it("should attach to HTTPS server", () => {
		const attachSpy = jest.spyOn(transport, "attach");
		transport.attach(mockServer);
		expect(attachSpy).toHaveBeenCalledWith(mockServer);
	});

	it("should return undefined for unknown subscriber", () => {
		expect(transport.getSubscriber("unknown", "none")).toBeUndefined();
	});

	it("should return false for unknown subscriber", () => {
		expect(transport.hasSubscriber("unknown", "none")).toBe(false);
	});

	it("should broadcast to no one when no connections", () => {
		const sent = transport.broadcastToTopic("test.topic", { hello: "world" });
		expect(sent).toBe(0);
	});

	it("should shutdown gracefully", async () => {
		await transport.shutdown();
		expect(transport.getConnectedCount()).toBe(0);
	});

	it("should handle broadcast without connections", () => {
		transport.broadcast({ type: "test" });
	});

	it("should handle shutdown twice", async () => {
		await transport.shutdown();
		await transport.shutdown();
	});

	it("should deny connection without x-service-name header", () => {
		transport.attach(mockServer);
		expect(verifyClientHandler).not.toBeNull();

		const mockCb = jest.fn();
		verifyClientHandler!(
			{
				req: { headers: {} } as IncomingMessage,
			},
			mockCb
		);
		expect(mockCb).toHaveBeenCalledWith(false, 400, expect.any(String));
	});

	it("should accept connection with valid headers", () => {
		transport.attach(mockServer);
		const mockCb = jest.fn();
		verifyClientHandler!(
			{
				req: createMockReq({}),
			},
			mockCb
		);
		expect(mockCb).toHaveBeenCalledWith(true);
	});

	it("should handle subscribe message type", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(
			Buffer.from(
				JSON.stringify({ type: "subscribe", topics: ["topic.a", "topic.b"] })
			)
		);

		const subscribeCall = (mockWs.send as jest.Mock).mock.calls.find(
			(call: unknown[]) =>
				typeof call[0] === "string" && call[0].includes("subscribed")
		);
		expect(subscribeCall).toBeDefined();
		const sentMsg = JSON.parse(subscribeCall[0] as string);
		expect(sentMsg.type).toBe("subscribed");
		expect(sentMsg.topics).toContain("topic.a");
	});

	it("should handle subscribe with instanceId mismatch", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(
			Buffer.from(
				JSON.stringify({
					type: "subscribe",
					instanceId: "other-instance",
					topics: ["topic.a"],
				})
			)
		);

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("instanceId mismatch")
		);
	});

	it("should handle subscribe with invalid topics", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(
			Buffer.from(JSON.stringify({ type: "subscribe", topics: "not-an-array" }))
		);

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("topics must be an array")
		);
	});

	it("should handle unsubscribe message type", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(
			Buffer.from(
				JSON.stringify({
					type: "unsubscribe",
					topics: ["topic.a"],
				})
			)
		);

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("unsubscribed")
		);
	});

	it("should handle unsubscribe with invalid topics", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(
			Buffer.from(JSON.stringify({ type: "unsubscribe", topics: null }))
		);

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("topics must be an array")
		);
	});

	it("should handle publish message type", async () => {
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

		expect(mockDispatcher.publish).toHaveBeenCalled();
		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("published")
		);
	});

	it("should handle publish with rate limit", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		for (let i = 0; i < 10001; i++) {
			await msgHandler(
				Buffer.from(
					JSON.stringify({
						type: "publish",
						payload: { num: i },
						metadata: { topic: "test.topic" },
					})
				)
			);
		}

		const lastSend = JSON.parse(
			(mockWs.send as jest.Mock).mock.calls[
				(mockWs.send as jest.Mock).mock.calls.length - 1
			] as string
		);
		expect(lastSend.type).toBe("error");
		expect(lastSend.message).toContain("Rate limit");
	});

	it("should handle ack message type", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(
			Buffer.from(JSON.stringify({ type: "ack", messageId: "msg-1" }))
		);

		expect(mockDispatcher.handleAck).toHaveBeenCalledWith("msg-1", "inst-1");
	});

	it("should handle ack with invalid messageId", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(
			Buffer.from(JSON.stringify({ type: "ack", messageId: 123 }))
		);

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("messageId must be a string")
		);
	});

	it("should handle nack message type", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(
			Buffer.from(JSON.stringify({ type: "nack", messageId: "msg-1" }))
		);

		expect(mockDispatcher.handleNack).toHaveBeenCalledWith("msg-1", "inst-1");
	});

	it("should handle unknown message type", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(Buffer.from(JSON.stringify({ type: "unknown" })));

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("Unknown message type")
		);
	});

	it("should handle invalid JSON message", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(Buffer.from("not json"));

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("Invalid JSON")
		);
	});

	it("should handle missing message type", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(Buffer.from(JSON.stringify({})));

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("Missing message type")
		);
	});

	it("should handle ws close event", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		expect(transport.getConnectedCount()).toBe(1);

		mockWs.emit("close");

		expect(transport.getConnectedCount()).toBe(0);
	});

	it("should handle ws error event", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		mockWs.emit("error", new Error("test error"));

		expect(mockWs.close).toHaveBeenCalled();
	});

	it("should handle backpressure rejection", async () => {
		mockDispatcher.getBackpressureRatio = jest
			.fn<() => number>()
			.mockReturnValue(0.95);

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

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("backpressure")
		);
	});

	it("should broadcast to topic with connected subscriber", () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(
			mockWs,
			createMockReq({ "x-subscribed-topics": "topic.a" })
		);

		const sent = transport.broadcastToTopic("topic.a", { data: 1 });
		expect(sent).toBe(1);
		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("topic.a")
		);
	});

	it("should broadcast message to all subscribers", () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		transport.broadcast({ type: "test" });

		expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining("test"));
	});

	it("should handle connected message on connection", () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("connected")
		);
		const sentMsg = JSON.parse(
			(mockWs.send as jest.Mock).mock.calls[0][0] as string
		);
		expect(sentMsg.instanceId).toBe("test-broker");
	});

	it("should handle publish error gracefully", async () => {
		mockDispatcher.publish = jest
			.fn<() => Promise<string>>()
			.mockRejectedValue(new Error("publish failed"));

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

	it("should handle deduplication in publish", async () => {
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
					metadata: {
						topic: "test.topic",
						delivery: { deduplicationId: "dedup-1" },
					},
				})
			)
		);

		expect(mockDispatcher.publish).toHaveBeenCalled();
	});

	it("should skip publish when dedup ID already seen locally", async () => {
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
					metadata: {
						topic: "test.topic",
						delivery: { deduplicationId: "dedup-local-1" },
					},
				})
			)
		);
		expect(mockDispatcher.publish).toHaveBeenCalledTimes(1);

		await msgHandler(
			Buffer.from(
				JSON.stringify({
					type: "publish",
					payload: { hello: "world" },
					metadata: {
						topic: "test.topic",
						delivery: { deduplicationId: "dedup-local-1" },
					},
				})
			)
		);
		expect(mockDispatcher.publish).toHaveBeenCalledTimes(1);
	});

	it("should handle publish with traceparent", async () => {
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
					traceparent:
						"00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
				})
			)
		);

		expect(mockDispatcher.publish).toHaveBeenCalled();
	});

	it("should handle publish without metadata topic", async () => {
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
					metadata: {},
				})
			)
		);

		expect(mockDispatcher.publish).toHaveBeenCalled();
	});

	it("should handle nack with invalid messageId", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(
			Buffer.from(JSON.stringify({ type: "nack", messageId: 456 }))
		);

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("messageId must be a string")
		);
	});

	it("should handle unsubscribe with instanceId mismatch", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		await msgHandler(
			Buffer.from(
				JSON.stringify({
					type: "unsubscribe",
					instanceId: "other-instance",
					topics: ["topic.a"],
				})
			)
		);

		expect(mockWs.send).toHaveBeenCalledWith(
			expect.stringContaining("instanceId mismatch")
		);
	});

	it("should handle dedup with Redis unavailable", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const redis = require("../../../../src/config/redis");
		redis.getStreamClient.mockResolvedValue({
			set: jest
				.fn<() => Promise<string | null>>()
				.mockRejectedValue(new Error("redis down")),
		});

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
						delivery: { deduplicationId: "dedup-fallback" },
					},
				})
			)
		);

		expect(mockDispatcher.publish).toHaveBeenCalled();
	});

	it("should attach twice (cleanup timer idempotent)", () => {
		transport.attach(mockServer);
		transport.attach(mockServer);
		expect(transport.getConnectedCount()).toBe(0);
	});

	it("should handle publish with dedup local cache hit", async () => {
		transport.attach(mockServer);
		const mockWs = createMockWs();
		connectionHandler!(mockWs, createMockReq({}));

		const msgHandler = mockWs._handlers.message as (
			raw: Buffer
		) => Promise<void>;

		// First publish with dedup id
		await msgHandler(
			Buffer.from(
				JSON.stringify({
					type: "publish",
					payload: { hello: "world" },
					metadata: {
						topic: "test.topic",
						delivery: { deduplicationId: "dedup-cache-hit" },
					},
				})
			)
		);
		expect(mockDispatcher.publish).toHaveBeenCalledTimes(1);

		// Second publish with same dedup id hits local cache
		await msgHandler(
			Buffer.from(
				JSON.stringify({
					type: "publish",
					payload: { hello: "world" },
					metadata: {
						topic: "test.topic",
						delivery: { deduplicationId: "dedup-cache-hit" },
					},
				})
			)
		);
		expect(mockDispatcher.publish).toHaveBeenCalledTimes(1);
	});
});
