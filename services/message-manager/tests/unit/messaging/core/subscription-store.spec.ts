import { describe, expect, it, jest } from "@jest/globals";
import {
	REDIS_RESP,
	REDIS_STATUS,
} from "@trading-model/common/persistence/redis-constants";

const mockExec = jest
	.fn<() => Promise<[Error | null, unknown][]>>()
	.mockResolvedValue([[null, 1]]);

function createMockMulti() {
	return {
		hset: jest.fn().mockReturnThis(),
		expire: jest.fn().mockReturnThis(),
		sadd: jest.fn().mockReturnThis(),
		del: jest.fn().mockReturnThis(),
		srem: jest.fn().mockReturnThis(),
		hdel: jest.fn().mockReturnThis(),
		scard: jest.fn().mockReturnThis(),
		exec: mockExec,
	};
}

function createMockPipeline() {
	return {
		hget: jest.fn().mockReturnThis(),
		exec: jest
			.fn<() => Promise<[Error | null, unknown][]>>()
			.mockResolvedValue([
				[
					null,
					'{"id":"sub-1","topic":"test.topic","callbackPath":"/cb","serviceIdentity":{"serviceName":"svc","instanceId":"inst-1"},"createdAt":"2026-01-01T00:00:00.000Z"}',
				],
			]),
	};
}

function createMockRedis() {
	return {
		status: REDIS_STATUS.READY,
		connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		exists: jest.fn<() => Promise<number>>().mockResolvedValue(0),
		smembers: jest.fn<() => Promise<string[]>>().mockResolvedValue(["inst-1"]),
		sscan: jest
			.fn<() => Promise<[string, string[]]>>()
			.mockResolvedValue(["0", ["topic-a"]]),
		hget: jest.fn<() => Promise<string | null>>().mockResolvedValue(null),
		hkeys: jest.fn<() => Promise<string[]>>().mockResolvedValue(["topic-a"]),
		hset: jest.fn<() => Promise<number>>().mockResolvedValue(1),
		srem: jest.fn<() => Promise<number>>().mockResolvedValue(1),
		ping: jest.fn<() => Promise<string>>().mockResolvedValue(REDIS_RESP.PONG),
		ttl: jest.fn<() => Promise<number>>().mockResolvedValue(-1),
		scard: jest.fn<() => Promise<number>>().mockResolvedValue(0),
		expire: jest.fn<() => Promise<number>>().mockResolvedValue(1),
		on: jest.fn(),
		off: jest.fn(),
		multi: jest.fn(() => createMockMulti()),
		pipeline: jest.fn(() => createMockPipeline()),
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
		STALE_HEARTBEAT_INTERVAL_MS: 10000,
		STALE_MISSED_HEARTBEAT_THRESHOLD: 3,
		STALE_GRACE_PERIOD_MS: 30000,
	},
}));

jest.mock("../../../../src/config/redis", () => ({
	getSubscriptionClient: jest.fn(),
}));

import { getSubscriptionClient } from "../../../../src/config/redis";
import { SubscriptionStore } from "../../../../src/messaging/core/subscription-store";

describe("SubscriptionStore", () => {
	let store: SubscriptionStore;
	let mockRedis: ReturnType<typeof createMockRedis>;
	const serviceIdentity = {
		serviceName: "test-service" as const,
		instanceId: "inst-1",
	};

	beforeEach(() => {
		mockRedis = createMockRedis();
		(
			getSubscriptionClient as jest.Mock<() => Promise<unknown>>
		).mockResolvedValue(mockRedis);
		store = new SubscriptionStore();
	});

	it("should add a subscription", async () => {
		await store.add({
			topic: "test.topic",
			callbackPath: "/cb",
			consumerIdentity: serviceIdentity,
		});
		expect(mockRedis.multi).toHaveBeenCalled();
	});

	it("should skip add if subscription exists", async () => {
		mockRedis.exists.mockResolvedValue(1);
		await store.add({
			topic: "test.topic",
			callbackPath: "/cb",
			consumerIdentity: serviceIdentity,
		});
		expect(mockRedis.multi).not.toHaveBeenCalled();
	});

	it("should remove a subscription", async () => {
		mockExec.mockResolvedValue([
			[null, 1],
			[null, 1],
			[null, 1],
			[null, 1],
			[null, 0],
			[null, 0],
		]);

		await store.remove("test.topic", "inst-1");
	});

	it("should remove with zero scard results", async () => {
		mockRedis.scard.mockResolvedValue(0);
		mockExec.mockResolvedValue([
			[null, 1],
			[null, 1],
			[null, 1],
			[null, 1],
			[null, 0],
			[null, 0],
		]);

		await store.remove("test.topic", "inst-1");
	});

	it("should get subscriptions by topic", async () => {
		const entries = await store.getByTopic("test.topic");
		expect(entries).toHaveLength(1);
		expect(entries[0].id).toBe("sub-1");
	});

	it("should get topics by instance", async () => {
		const topics = await store.getTopicsByInstance("inst-1");
		expect(topics).toEqual(["inst-1"]);
	});

	it("should get all topics", async () => {
		const topics = await store.getAllTopics();
		expect(topics).toEqual(["topic-a"]);
	});

	it("should renew lease", async () => {
		await store.renewLease("inst-1", ["test.topic"]);
		expect(mockRedis.multi).toHaveBeenCalled();
	});

	it("should skip renew lease with empty topics", async () => {
		await store.renewLease("inst-1", []);
		expect(mockRedis.multi).not.toHaveBeenCalled();
	});

	it("should heartbeat", async () => {
		await store.heartbeat("inst-1");
		expect(mockRedis.hset).toHaveBeenCalled();
		expect(mockRedis.expire).toHaveBeenCalled();
	});

	it("should detect stale by heartbeat when missing", async () => {
		mockRedis.hget.mockResolvedValue(null);
		const isStale = await store.isStaleByHeartbeat("inst-1");
		expect(isStale).toBe(true);
	});

	it("should detect not stale by heartbeat when recent", async () => {
		mockRedis.hget.mockResolvedValue(Date.now().toString());
		const isStale = await store.isStaleByHeartbeat("inst-1");
		expect(isStale).toBe(false);
	});

	it("should detect stale by heartbeat when expired", async () => {
		const oldTime = Date.now() - 120000;
		mockRedis.hget.mockResolvedValue(oldTime.toString());
		const isStale = await store.isStaleByHeartbeat("inst-1");
		expect(isStale).toBe(true);
	});

	it("should remove stale instances", async () => {
		mockRedis.ttl.mockResolvedValue(-1);
		mockRedis.hget.mockResolvedValue((Date.now() - 120000).toString());
		mockRedis.hkeys.mockResolvedValue(["topic-a", "heartbeat"]);

		const removed = await store.removeStaleInstances();
		expect(removed).toBe(2);
	});

	it("should skip instances with active ttl", async () => {
		mockRedis.ttl.mockResolvedValue(100);
		const removed = await store.removeStaleInstances();
		expect(removed).toBe(0);
	});

	it("should health check pass", async () => {
		const healthy = await store.healthCheck();
		expect(healthy).toBe(true);
	});

	it("should health check fail when ping fails", async () => {
		mockRedis.ping.mockRejectedValue(new Error("down"));
		const healthy = await store.healthCheck();
		expect(healthy).toBe(false);
	});

	it("should return empty array when no subscriptions for topic", async () => {
		mockRedis.smembers.mockResolvedValue([]);
		const entries = await store.getByTopic("test.topic");
		expect(entries).toEqual([]);
	});
});
