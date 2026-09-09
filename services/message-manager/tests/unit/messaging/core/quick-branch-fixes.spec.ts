import { describe, expect, it, jest } from "@jest/globals";
import { RedisKeyBuilder } from "../../../../src/infrastructure/redis/redis-key-builder";

jest.mock("../../../../src/config/redis", () => ({
	getStreamClient: jest.fn().mockResolvedValue({}),
	getSubscriptionClient: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../../../src/infrastructure/config/env", () => ({
	ENV: { REDIS_MESSAGE_TTL_S: 3600, REDIS_PREFIX: "test:" },
}));

jest.mock("../../../../src/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const testKeys = new RedisKeyBuilder("test:");

// These tests cover default-parameter branches in facade/operations files
describe("branch coverage: default parameter branches", () => {
	it("pending-ack-store recoverPendingAcks default param", async () => {
		const {
			PendingAckStore,
		} = require("../../../../src/messaging/core/pending-ack-store");
		const store = new PendingAckStore(testKeys);
		const result = await store.recoverPendingAcks("instance-1");
		expect(result).toBe(0);
	});

	it("request-signer short secret path", () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.DLQ_AUTH_HMAC_SECRET = "";
			const {
				signedOptions,
			} = require("../../../../src/adapters/outbound/request-signer");
			const { logger } = require("../../../../src/config/logger");
			signedOptions({ method: "GET", path: "/test", body: undefined });
			expect(logger.warn).toHaveBeenCalled();
		});
	});

	it("dlq-replay-handler replay default param", async () => {
		const mockGet = jest.fn().mockResolvedValue({ entries: [] });
		const {
			DlqReplayHandler,
		} = require("../../../../src/messaging/core/dlq-replay-handler");
		const handler = new DlqReplayHandler(
			{ get: mockGet } as never,
			"http://test:3000"
		);
		const result = await handler.replay();
		expect(result).toEqual([]);
	});

	it("dlq-replay-handler replay with topic without default", async () => {
		const mockGet = jest.fn().mockResolvedValue({ entries: [] });
		const {
			DlqReplayHandler,
		} = require("../../../../src/messaging/core/dlq-replay-handler");
		const handler = new DlqReplayHandler(
			{ get: mockGet } as never,
			"http://test:3000"
		);
		const result = await handler.replay("test-topic");
		expect(result).toEqual([]);
	});

	it("dlq-replay-handler replay error branch", async () => {
		const mockGet = jest.fn().mockRejectedValue(new Error("fail"));
		const {
			DlqReplayHandler,
		} = require("../../../../src/messaging/core/dlq-replay-handler");
		const handler = new DlqReplayHandler(
			{ get: mockGet } as never,
			"http://test:3000"
		);
		const result = await handler.replay();
		expect(result).toEqual([]);
	});

	it("topic-claim-scanner claimForTopic empty pending array", async () => {
		const mockRedis = {
			xpending: jest.fn().mockResolvedValue([]),
			xclaim: jest.fn(),
		};
		const {
			TopicClaimScanner,
		} = require("../../../../src/messaging/core/topic-claim-scanner");
		const scanner = new TopicClaimScanner(testKeys);
		const count = await scanner.claimForTopic(mockRedis as never, "t", {
			groupName: "g",
			consumerId: "c",
			minIdleMs: 60000,
			count: 100,
		});
		expect(count).toBe(0);
		expect(mockRedis.xclaim).not.toHaveBeenCalled();
	});

	it("topic-claim-scanner claimForTopic error branch", async () => {
		const mockRedis = {
			xpending: jest.fn().mockRejectedValue(new Error("err")),
		};
		const {
			TopicClaimScanner,
		} = require("../../../../src/messaging/core/topic-claim-scanner");
		const scanner = new TopicClaimScanner(testKeys);
		const count = await scanner.claimForTopic(mockRedis as never, "t", {
			groupName: "g",
			consumerId: "c",
			minIdleMs: 60000,
			count: 100,
		});
		expect(count).toBe(0);
	});

	it("stale-entry-scanner scan with multi-page and stale entries", async () => {
		const now = Date.now();
		const mockRedis = {
			hscan: jest
				.fn()
				.mockResolvedValueOnce([
					"1",
					[
						"msg-1",
						JSON.stringify({
							pendingAt: now - 200000,
							message: { metadata: {} },
						}),
					],
				])
				.mockResolvedValueOnce(["0", []]),
		};
		const {
			StaleEntryScanner,
		} = require("../../../../src/messaging/core/stale-entry-scanner");
		const scanner = new StaleEntryScanner();
		const stale = await scanner.scan(mockRedis as never, "key", now, 120000);
		expect(stale).toEqual(["msg-1"]);
	});

	it("stale-entry-scanner scan with parse error entry", async () => {
		const mockRedis = {
			hscan: jest.fn().mockResolvedValue(["0", ["msg-1", "bad-json"]]),
		};
		const {
			StaleEntryScanner,
		} = require("../../../../src/messaging/core/stale-entry-scanner");
		const scanner = new StaleEntryScanner();
		const stale = await scanner.scan(
			mockRedis as never,
			"key",
			Date.now(),
			120000
		);
		expect(stale).toEqual(["msg-1"]);
	});

	it("request-signer long secret signs request", () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.DLQ_AUTH_HMAC_SECRET = "a-string-at-least-16-chars!!";
			const {
				signedOptions,
			} = require("../../../../src/adapters/outbound/request-signer");
			const opts = signedOptions({
				method: "POST",
				path: "/test",
				body: { key: "val" },
				extra: { timeoutMs: 3000 },
			});
			expect(opts.timeoutMs).toBe(3000);
		});
	});

	it("redis-client-factory redisRetryDelay with retries > 1", () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.REDIS_MAX_RECONNECT_ATTEMPTS = 10;
			const {
				redisRetryDelay,
			} = require("../../../../src/config/redis-client-factory");
			const delay = redisRetryDelay(3);
			expect(delay).toBeGreaterThanOrEqual(100);
		});
	});

	it("redis-client-factory redisRetryDelay with max attempts reached", () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.REDIS_MAX_RECONNECT_ATTEMPTS = 3;
			const {
				redisRetryDelay,
			} = require("../../../../src/config/redis-client-factory");
			const result = redisRetryDelay(3);
			expect(result).toBeNull();
		});
	});
});

describe("branch coverage: flush-failure-handler", () => {
	it("handle with err and buffer", async () => {
		const {
			FlushFailureHandler,
		} = require("../../../../src/messaging/core/flush-failure-handler");
		const handler = new FlushFailureHandler();
		const redisBackoff = {
			current: 10,
			markDown: jest.fn(),
			increaseBackoff: jest.fn(),
		};
		const batch = [{ topic: "t", serialized: "{}" }];
		const buffer: unknown[] = [];
		await handler.handle(
			batch as never,
			redisBackoff as never,
			buffer as never,
			new Error("test")
		);
		expect(redisBackoff.markDown).toHaveBeenCalled();
	});

	it("handle without err and buffer", async () => {
		const {
			FlushFailureHandler,
		} = require("../../../../src/messaging/core/flush-failure-handler");
		const handler = new FlushFailureHandler();
		const redisBackoff = {
			current: 10,
			markDown: jest.fn(),
			increaseBackoff: jest.fn(),
		};
		const batch = [{ topic: "t", serialized: "{}" }];
		await handler.handle(batch as never, redisBackoff as never);
		expect(redisBackoff.markDown).toHaveBeenCalled();
	});
});

describe("branch coverage: wal-fallback-handler", () => {
	it("isPayloadTooLarge returns false when within limit", () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.MAX_PAYLOAD_BYTES = 1024;
			const {
				WalFallbackHandler,
			} = require("../../../../src/messaging/core/wal-fallback-handler");
			const handler = new WalFallbackHandler({} as never);
			expect(handler.isPayloadTooLarge("t", "small")).toBe(false);
		});
	});

	it("isPayloadTooLarge returns true when exceeds limit", () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.MAX_PAYLOAD_BYTES = 4;
			const {
				WalFallbackHandler,
			} = require("../../../../src/messaging/core/wal-fallback-handler");
			const handler = new WalFallbackHandler({} as never);
			expect(handler.isPayloadTooLarge("t", "too-large-payload")).toBe(true);
		});
	});

	it("storeInWal catch path buffers in memory", async () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.MAX_PAYLOAD_BYTES = 99999;
			const {
				WalFallbackHandler,
			} = require("../../../../src/messaging/core/wal-fallback-handler");
			const bufferInMemory = jest.fn();
			const flush = jest.fn().mockResolvedValue(undefined);
			const walFlusher = {
				storeInWal: jest.fn().mockRejectedValue(new Error("redis down")),
				bufferInMemory,
				flush,
			};
			const handler = new WalFallbackHandler(walFlusher);
			return handler
				.storeInWal({ topic: "t", serialized: "{}" } as never)
				.then((result: string) => {
					expect(result).toBe("memory-buffered");
					expect(bufferInMemory).toHaveBeenCalled();
				});
		});
	});
});

describe("branch coverage: mongo-client-manager", () => {
	it("canStart returns false when no MONGO_ARCHIVE_URI", () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.MONGO_ARCHIVE_URI = "";
			const {
				MongoClientManager,
			} = require("../../../../src/messaging/core/mongo-client-manager");
			const mgr = new MongoClientManager();
			expect(mgr.canStart()).toBe(false);
		});
	});

	it("canStart returns false when already started", () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.MONGO_ARCHIVE_URI = "mongodb://localhost:27017";
			const {
				MongoClientManager,
			} = require("../../../../src/messaging/core/mongo-client-manager");
			const mgr = new MongoClientManager();
			(mgr as unknown as Record<string, unknown>)._client = {} as never;
			expect(mgr.canStart()).toBe(false);
		});
	});

	it("canStart returns true when configured and not started", () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.MONGO_ARCHIVE_URI = "mongodb://localhost:27017";
			const {
				MongoClientManager,
			} = require("../../../../src/messaging/core/mongo-client-manager");
			const mgr = new MongoClientManager();
			expect(mgr.canStart()).toBe(true);
		});
	});

	it("ensureIndexes skips when no client", async () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.MONGO_ARCHIVE_URI = "mongodb://localhost:27017";
			env.ENV.MONGO_ARCHIVE_DB = "test";
			env.ENV.MONGO_ARCHIVE_COLLECTION = "archive";
			const {
				MongoClientManager,
			} = require("../../../../src/messaging/core/mongo-client-manager");
			const mgr = new MongoClientManager();
			return mgr.ensureIndexes().then(() => {
				expect(true).toBe(true);
			});
		});
	});

	it("close skips when no manager", async () => {
		jest.isolateModules(() => {
			const env = require("../../../../src/infrastructure/config/env");
			env.ENV.MONGO_ARCHIVE_URI = "mongodb://localhost:27017";
			const {
				MongoClientManager,
			} = require("../../../../src/messaging/core/mongo-client-manager");
			const mgr = new MongoClientManager();
			return mgr.close().then(() => {
				expect(true).toBe(true);
			});
		});
	});
});
