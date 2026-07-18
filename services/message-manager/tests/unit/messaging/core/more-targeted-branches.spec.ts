import { describe, expect, it, jest } from "@jest/globals";
import { RedisKeyBuilder } from "../../../../src/infrastructure/redis/redis-key-builder";

const testKeys = new RedisKeyBuilder("test:");

// These tests target specific uncovered branches without importing complex deps

describe("stale-entry-scanner pendingAt vs emittedAt branches", () => {
	it("entry with pendingAt uses it for age computation", async () => {
		const now = Date.now();
		const mockRedis = {
			hscan: jest.fn().mockResolvedValue([
				"0",
				[
					"msg-1",
					JSON.stringify({
						pendingAt: now - 200000,
						message: {
							metadata: { emittedAt: new Date(now - 10000).toISOString() },
						},
					}),
				],
			]),
		};
		const {
			StaleEntryScanner,
		} = require("../../../../src/messaging/core/stale-entry-scanner");
		const scanner = new StaleEntryScanner();
		const stale = await scanner.scan(mockRedis as never, "key", now, 120000);
		expect(stale).toEqual(["msg-1"]);
	});

	it("entry without pendingAt uses emittedAt", async () => {
		const now = Date.now();
		const mockRedis = {
			hscan: jest.fn().mockResolvedValue([
				"0",
				[
					"msg-1",
					JSON.stringify({
						message: {
							metadata: { emittedAt: new Date(now - 200000).toISOString() },
						},
					}),
				],
			]),
		};
		const {
			StaleEntryScanner,
		} = require("../../../../src/messaging/core/stale-entry-scanner");
		const scanner = new StaleEntryScanner();
		const stale = await scanner.scan(mockRedis as never, "key", now, 120000);
		expect(stale).toEqual(["msg-1"]);
	});
});

describe("message-stream-writer serializer and store", () => {
	it("serializePayload serializes a message", () => {
		const {
			serializePayload,
		} = require("../../../../src/messaging/core/message-stream-writer");
		const result = serializePayload({ topic: "t", metadata: {} } as never);
		expect(result).toBe('{"topic":"t","metadata":{}}');
	});
});

describe("pending-ack-store branches", () => {
	it("recoverStale with stale entries detected", async () => {
		const now = Date.now();
		const mockRedis = {
			hscan: jest.fn().mockResolvedValue([
				"0",
				[
					"msg-1",
					JSON.stringify({
						pendingAt: now - 200000,
						message: { metadata: {} },
					}),
				],
			]),
			hdel: jest.fn().mockResolvedValue(1),
		};
		jest.isolateModules(() => {
			const redis = require("../../../../src/config/redis");
			redis.getStreamClient = jest.fn().mockResolvedValue(mockRedis);
			const env = require("../../../../src/config/env");
			env.ENV.REDIS_MESSAGE_TTL_S = 3600;
			const {
				PendingAckStore,
			} = require("../../../../src/messaging/core/pending-ack-store");
			const store = new PendingAckStore(testKeys);
			return store.recoverStale("i1", 120000).then((count: number) => {
				expect(count).toBe(1);
			});
		});
	});

	it("recoverStale error returns 0", async () => {
		jest.isolateModules(() => {
			const redis = require("../../../../src/config/redis");
			redis.getStreamClient = jest.fn().mockRejectedValue(new Error("err"));
			const env = require("../../../../src/config/env");
			env.ENV.REDIS_MESSAGE_TTL_S = 3600;
			const {
				PendingAckStore,
			} = require("../../../../src/messaging/core/pending-ack-store");
			const store = new PendingAckStore(testKeys);
			return store.recoverStale("i1", 120000).then((count: number) => {
				expect(count).toBe(0);
			});
		});
	});
});
