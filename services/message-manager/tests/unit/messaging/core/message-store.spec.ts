import { describe, expect, it, jest } from "@jest/globals";

const mockXadd = jest
	.fn<(...args: unknown[]) => Promise<string>>()
	.mockResolvedValue("1689000000000-0");
const mockExpire = jest.fn<() => Promise<number>>().mockResolvedValue(1);
const mockMulti = jest.fn(() => ({
	xadd: jest.fn().mockReturnThis(),
	expire: jest.fn().mockReturnThis(),
	rpush: jest.fn().mockReturnThis(),
	exec: jest
		.fn<() => Promise<[Error | null, unknown][]>>()
		.mockResolvedValue([[null, "OK"]]),
}));
const mockEval = jest
	.fn<(...args: unknown[]) => Promise<unknown>>()
	.mockResolvedValue([]);
const mockLlen = jest.fn<() => Promise<number>>().mockResolvedValue(0);
const mockLrang = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockLtrim = jest.fn<() => Promise<string>>().mockResolvedValue("OK");
const mockRpush = jest.fn<() => Promise<number>>().mockResolvedValue(1);
const mockSet = jest
	.fn<(...args: unknown[]) => Promise<string | null>>()
	.mockResolvedValue("OK");
const mockXreadgroup = jest
	.fn<() => Promise<unknown>>()
	.mockResolvedValue(null);
const mockXack = jest.fn<() => Promise<number>>().mockResolvedValue(1);
const mockXrange = jest
	.fn<() => Promise<[string, string[]][]>>()
	.mockResolvedValue([
		[
			"1689000000000-0",
			[
				"data",
				'{"metadata":{"messageId":"msg-1","topic":"test.topic","eventType":"Test"},"payload":"hello"}',
			],
		],
	]);
const mockXpending = jest
	.fn<(...args: unknown[]) => Promise<unknown>>()
	.mockResolvedValue({ pending: 0 } as never);
const mockHset = jest.fn<() => Promise<number>>().mockResolvedValue(1);
const mockHdel = jest.fn<() => Promise<number>>().mockResolvedValue(1);
const mockHscan = jest
	.fn<() => Promise<[string, string[]]>>()
	.mockResolvedValue(["0", []]);
const mockSscan = jest
	.fn<() => Promise<[string, string[]]>>()
	.mockResolvedValue(["0", []]);
const mockCall = jest
	.fn<(...args: unknown[]) => Promise<unknown>>()
	.mockResolvedValue([]);
const mockXclaim = jest
	.fn<(...args: unknown[]) => Promise<unknown>>()
	.mockResolvedValue([]);

function createMockRedis() {
	return {
		status: "ready",
		connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		multi: mockMulti,
		xadd: mockXadd,
		expire: mockExpire,
		eval: mockEval,
		llen: mockLlen,
		lrang: mockLrang,
		ltrim: mockLtrim,
		rpush: mockRpush,
		set: mockSet,
		xreadgroup: mockXreadgroup,
		xack: mockXack,
		xrange: mockXrange,
		xpending: mockXpending,
		hset: mockHset,
		hdel: mockHdel,
		hscan: mockHscan,
		sscan: mockSscan,
		call: mockCall,
		xclaim: mockXclaim,
		on: jest.fn(),
		off: jest.fn(),
		removeAllListeners: jest.fn(),
		disconnect: jest.fn(),
		ping: jest.fn<() => Promise<string>>().mockResolvedValue("PONG"),
	};
}

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn(() => createMockRedis()),
	Redis: jest.fn(() => createMockRedis()),
}));

jest.mock("../../../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../../src/config/env", () => ({
	ENV: {
		REDIS_PREFIX: "mm:",
		REDIS_STREAM_MAXLEN: 10000,
		REDIS_MESSAGE_TTL_S: 86400,
		MAX_PAYLOAD_BYTES: 1048576,
		MEMORY_WAL_BUFFER_SIZE: 1000,
		MEMORY_WAL_BUFFER_WARN_PCT: 0.8,
		DLQ_LOCAL_FALLBACK_PATH: "./dead-letter-queue.jsonl",
	},
}));

jest.mock("../../../../src/config/redis", () => ({
	getStreamClient: jest.fn(),
}));

jest.mock("../../../../src/config/metrics", () => ({
	MESSAGES_DLQ_TOTAL: { inc: jest.fn() },
	BUFFER_DROPPED_TOTAL: { inc: jest.fn() },
}));

import { DateRange } from "@trading-model/common/domain/date-range";
import { getStreamClient } from "../../../../src/config/redis";
import { MessageStore } from "../../../../src/messaging/core/message-store";

describe("MessageStore", () => {
	let messageStore: MessageStore;
	let mockRedis: ReturnType<typeof createMockRedis>;

	beforeEach(() => {
		mockRedis = createMockRedis();
		(getStreamClient as jest.Mock<() => Promise<unknown>>).mockResolvedValue(
			mockRedis
		);
		mockSet.mockResolvedValue("OK");
		messageStore = new MessageStore();
	});

	afterEach(async () => {
		await messageStore.drainAndStop(100);
		messageStore.stop();
	});

	it("should store a message in Redis stream", async () => {
		mockXadd.mockResolvedValue("1689000000000-0");

		const result = await messageStore.store("test.topic", {
			metadata: {
				messageId: "msg-1",
				topic: "test.topic",
				eventType: "Test",
				publisher: { serviceName: "test", instanceId: "i-1" },
				emittedAt: new Date(),
			},
			payload: { foo: "bar" },
		} as never);

		expect(result).toBe("1689000000000-0");
		expect(mockXadd).toHaveBeenCalled();
	});

	it("should ensure consumer group", async () => {
		mockRedis.xgroup = jest.fn().mockResolvedValue("OK");

		await messageStore.ensureConsumerGroup({
			topic: "test.topic",
			groupName: "test-group",
		});

		expect(mockRedis.xgroup).toHaveBeenCalledWith(
			"CREATE",
			"mm:stream:test.topic",
			"test-group",
			"$",
			"MKSTREAM"
		);
	});

	it("should handle BUSYGROUP error gracefully", async () => {
		const busyError = new Error("BUSYGROUP Consumer Group name already exists");
		mockRedis.xgroup = jest.fn().mockRejectedValue(busyError);

		await messageStore.ensureConsumerGroup({
			topic: "test.topic",
			groupName: "test-group",
		});
	});

	it("should warn on non-BUSYGROUP error", async () => {
		const otherError = new Error("OTHER error");
		mockRedis.xgroup = jest.fn().mockRejectedValue(otherError);

		await messageStore.ensureConsumerGroup({
			topic: "test.topic",
			groupName: "test-group",
		});
	});

	it("should read from consumer group", async () => {
		mockXreadgroup.mockResolvedValue([
			[
				"mm:stream:test.topic",
				[["1689000000000-0", ["data", '{"hello":"world"}']]],
			],
		]);

		const messages = await messageStore.readFromGroup({
			topic: "test.topic",
			groupName: "test-group",
			consumerId: "consumer-1",
			count: 10,
			blockMs: 1000,
		});

		expect(messages).toHaveLength(1);
		expect(messages[0].id).toBe("1689000000000-0");
	});

	it("should return empty when no messages in group", async () => {
		mockXreadgroup.mockResolvedValue(null);

		const messages = await messageStore.readFromGroup({
			topic: "test.topic",
			groupName: "test-group",
			consumerId: "consumer-1",
		});

		expect(messages).toEqual([]);
	});

	it("should ack a message", async () => {
		await messageStore.ackMessage({
			topic: "test.topic",
			groupName: "test-group",
			messageId: "1689000000000-0",
		});

		expect(mockXack).toHaveBeenCalledWith(
			"mm:stream:test.topic",
			"test-group",
			"1689000000000-0"
		);
	});

	it("should get messages after timestamp", async () => {
		mockXrange.mockResolvedValue([
			[
				"1689000000000-0",
				[
					"data",
					'{"metadata":{"messageId":"msg-1","topic":"test.topic","eventType":"Test"},"payload":"hello"}',
				],
			],
		]);

		const messages = await messageStore.getMessagesAfter({
			topic: "test.topic",
			afterTimestamp: Date.now() - 3600000,
			limit: 10,
		});

		expect(messages).toHaveLength(1);
	});

	it("should return empty when xrange has no data field", async () => {
		mockXrange.mockResolvedValue([["id", ["other-field", "value"]]]);

		const messages = await messageStore.getMessagesAfter({
			topic: "test.topic",
			afterTimestamp: 0,
			limit: 10,
		});
		expect(messages).toEqual([]);
	});

	it("should get messages between timestamps", async () => {
		mockXrange.mockResolvedValue([
			[
				"1689000000000-0",
				[
					"data",
					'{"metadata":{"messageId":"msg-2","topic":"test.topic","eventType":"Test"},"payload":"world"}',
				],
			],
		]);

		const messages = await messageStore.getMessagesBetween({
			topic: "test.topic",
			timeRange: DateRange.fromUnixTimestamps(Date.now() - 7200000, Date.now()),
			limit: 10,
		});

		expect(messages).toHaveLength(1);
	});

	it("should get pending count", async () => {
		mockXpending.mockResolvedValue({ pending: 5 } as never);

		const count = await messageStore.getPendingCount({
			topic: "test.topic",
			groupName: "test-group",
		});

		expect(count).toBe(5);
	});

	it("should add pending ack", async () => {
		await messageStore.addPendingAck("inst-1", "msg-1", {
			topic: "test.topic",
			subscriberUrl: "http://sub",
			message: {} as never,
		});

		expect(mockHset).toHaveBeenCalled();
	});

	it("should remove pending ack", async () => {
		await messageStore.removePendingAck("inst-1", "msg-1");

		expect(mockHdel).toHaveBeenCalled();
	});

	it("should get pending acks", async () => {
		mockHscan.mockResolvedValue([
			"0",
			[
				"msg-1",
				'{"topic":"test.topic","subscriberUrl":"http://sub","message":{"metadata":{},"payload":{}}}',
			],
		]);

		const acks = await messageStore.getPendingAcks("inst-1");

		expect(acks["msg-1"]).toBeDefined();
	});

	it("should deduplicate with Redis", async () => {
		mockSet.mockResolvedValue("OK");

		const result = await messageStore.tryDeduplicate("dedup-1", 300);

		expect(result).toBe(true);
	});

	it("should reject duplicate", async () => {
		const first = await messageStore.tryDeduplicate("dedup-test-2", 300);
		expect(first).toBe(true);

		const second = await messageStore.tryDeduplicate("dedup-test-2", 300);
		expect(second).toBe(false);
	});

	it("should handle dedup with Redis down", async () => {
		mockSet.mockRejectedValue(new Error("redis down"));

		const result = await messageStore.tryDeduplicate("dedup-2", 300);
		expect(result).toBe(true);

		const duplicate = await messageStore.tryDeduplicate("dedup-2", 300);
		expect(duplicate).toBe(false);
	});

	it("should get stream lag", async () => {
		mockCall.mockResolvedValue([
			["name", "test-group", "last-delivered-id", "1689000000000-0"],
		]);

		const lag = await messageStore.getStreamLag({
			topic: "test.topic",
			groupName: "test-group",
		});
		expect(typeof lag).toBe("number");
	});

	it("should return 0 lag when no group info", async () => {
		mockCall.mockResolvedValue([]);

		const lag = await messageStore.getStreamLag({
			topic: "test.topic",
			groupName: "test-group",
		});
		expect(lag).toBe(0);
	});

	it("should drain wal on startup", async () => {
		mockLlen.mockResolvedValue(0);

		await messageStore.drainWalOnStartup();
	});

	it("should handle claim pending messages with no lock", async () => {
		mockSet.mockResolvedValue(null);

		const result = await messageStore.claimPendingMessages(
			"test-group",
			"consumer-1",
			60000,
			100
		);

		expect(result).toBe(0);
	});

	it("should handle claim pending messages", async () => {
		mockSscan.mockResolvedValue(["0", ["test.topic"]]);
		mockXpending.mockResolvedValue([
			["1689000000000-0", "consumer-1", 60001, 120000],
		]);
		mockXclaim.mockResolvedValue([["1689000000000-0", ["data", "{}"]]]);

		const result = await messageStore.claimPendingMessages(
			"test-group",
			"consumer-1",
			60000,
			100
		);

		expect(result).toBe(1);
	});

	it("should drain and stop", async () => {
		await messageStore.drainAndStop(100);
	});

	it("should recover pending acks", async () => {
		mockHscan.mockResolvedValue([
			"0",
			[
				"msg-1",
				JSON.stringify({
					topic: "test.topic",
					subscriberUrl: "http://sub",
					message: {
						metadata: { emittedAt: Date.now() - 300000 },
						payload: {},
					},
					pendingAt: Date.now() - 300000,
				}),
			],
		]);

		const count = await messageStore.recoverPendingAcks("inst-1", 120000);
		expect(count).toBe(1);
	});

	it("should recover pending acks with parse error", async () => {
		mockHscan.mockResolvedValue(["0", ["bad-msg", "not-json"]]);

		const count = await messageStore.recoverPendingAcks("inst-1", 120000);
		expect(count).toBe(1);
	});

	it("should recover pending acks with error", async () => {
		mockHscan.mockRejectedValue(new Error("scan error"));

		const count = await messageStore.recoverPendingAcks("inst-1", 120000);
		expect(count).toBe(0);
	});

	it("should recover pending acks with missing pendingAt", async () => {
		mockHscan.mockResolvedValue([
			"0",
			[
				"msg-old",
				JSON.stringify({
					topic: "test.topic",
					subscriberUrl: "http://sub",
					message: {
						metadata: { emittedAt: Date.now() - 300000 },
						payload: {},
					},
				}),
			],
		]);

		const count = await messageStore.recoverPendingAcks("inst-1", 120000);
		expect(count).toBe(1);
	});

	it("should get stream lag with group not found", async () => {
		mockCall.mockResolvedValue([
			["name", "wrong-group", "last-delivered-id", "1689000000000-0"],
		]);

		const lag = await messageStore.getStreamLag({
			topic: "test.topic",
			groupName: "test-group",
		});
		expect(lag).toBe(0);
	});

	it("should drain wal with pending entries", async () => {
		mockEval
			.mockResolvedValueOnce([
				'{"topic":"test.topic","serialized":"{\\"payload\\":\\"test\\"}"}',
			])
			.mockResolvedValue([]);
		mockLlen.mockResolvedValue(1);
		mockMulti.mockReturnValue({
			xadd: jest.fn().mockReturnThis(),
			expire: jest.fn().mockReturnThis(),
			exec: jest
				.fn<() => Promise<[Error | null, unknown][]>>()
				.mockResolvedValue([
					[null, "OK"],
					[null, 1],
				]),
		});

		await messageStore.drainWal(500);
	});

	it("should drain wal with no pending entries", async () => {
		mockLlen.mockResolvedValue(0);

		await messageStore.drainWal(500);
	});

	it("should be idempotent for drainWal", async () => {
		mockLlen.mockResolvedValue(0);

		await Promise.all([messageStore.drainWal(500), messageStore.drainWal(500)]);
	});

	it("should handle wal flush with malformed entries", async () => {
		mockEval.mockResolvedValueOnce(["not-json"]).mockResolvedValue([]);
		mockLlen.mockResolvedValue(1);

		await messageStore.drainWal(500);
	});

	it("should handle wal flush with consecutive errors", async () => {
		const failResult = [new Error("fail"), null] as [Error, null];
		mockEval
			.mockResolvedValueOnce(['{"topic":"test.topic","serialized":"{}"}'])
			.mockResolvedValue([]);
		mockLlen.mockResolvedValue(1);
		mockMulti.mockReturnValue({
			xadd: jest.fn().mockReturnThis(),
			expire: jest.fn().mockReturnThis(),
			exec: jest
				.fn<() => Promise<[Error | null, unknown][]>>()
				.mockResolvedValue([failResult]),
		});

		await messageStore.drainWal(500);
	});
});
