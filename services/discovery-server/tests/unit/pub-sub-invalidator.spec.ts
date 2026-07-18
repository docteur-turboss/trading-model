import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { REDIS_STATUS } from "@trading-model/common/persistence/redis-constants";
import type { LruCache } from "@trading-model/common/utils/lru-cache";
import type { ServiceInstance } from "@trading-model/validation/contracts/service-registry.types";
import type { CacheManager } from "../../src/core/cache-manager";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

interface MockRedis {
	status: string;
	connect: jest.Mock;
	on: jest.Mock;
	subscribe: jest.Mock;
	publish: jest.Mock;
	unsubscribe: jest.Mock;
	disconnect: jest.Mock;
	ping: jest.Mock;
}

let mockRedis: MockRedis;
const mockRedisCtor: jest.Mock = jest.fn(() => {
	mockRedis = {
		status: REDIS_STATUS.CLOSE,
		connect: jest.fn().mockResolvedValue(undefined),
		on: jest.fn(),
		subscribe: jest.fn().mockResolvedValue(1),
		publish: jest.fn().mockResolvedValue(1),
		unsubscribe: jest.fn().mockResolvedValue(1),
		disconnect: jest.fn(),
		ping: jest.fn().mockResolvedValue("PONG"),
	};
	return mockRedis;
});

jest.mock("ioredis", () => ({
	__esModule: true,
	default: mockRedisCtor,
	Redis: mockRedisCtor,
}));

import { PubSubInvalidator } from "../../src/core/pub-sub-invalidator";

function createMockCacheManager(): jest.Mocked<CacheManager> {
	return {
		cache: {
			get: jest.fn(),
			set: jest.fn(),
			has: jest.fn(),
			delete: jest.fn(),
			clear: jest.fn(),
			size: 0,
		} as unknown as jest.Mocked<LruCache<ServiceInstance[]>>,
		staleData: {
			get: jest.fn(),
			set: jest.fn(),
			has: jest.fn(),
			delete: jest.fn(),
			clear: jest.fn(),
			size: 0,
		} as unknown as jest.Mocked<LruCache<ServiceInstance[]>>,
		set: jest.fn(),
		delete: jest.fn(),
		invalidate: jest.fn(),
		clear: jest.fn(),
	} as unknown as jest.Mocked<CacheManager>;
}

describe("PubSubInvalidator", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("constructor", () => {
		it("should create a real Redis client when URL is provided", () => {
			const pubSub = new PubSubInvalidator("redis://localhost:6379");

			expect(mockRedisCtor).toHaveBeenCalledWith(
				"redis://localhost:6379",
				expect.objectContaining({ lazyConnect: true })
			);
			pubSub.stop();
		});

		it("should create a null Redis client when URL is not provided", () => {
			const pubSub = new PubSubInvalidator();

			expect(mockRedisCtor).not.toHaveBeenCalled();
			expect(pubSub.client.status).toBe(REDIS_STATUS.CLOSE);
			pubSub.stop();
		});
	});

	describe("start", () => {
		it("should connect, subscribe, and set up message listener", async () => {
			const pubSub = new PubSubInvalidator("redis://localhost:6379");
			const cache = createMockCacheManager();

			await pubSub.start(cache);

			expect(mockRedis.connect).toHaveBeenCalled();
			expect(mockRedis.subscribe).toHaveBeenCalledWith("cache:invalidate");
			expect(mockRedis.on).toHaveBeenCalledWith(
				"message",
				expect.any(Function)
			);
			pubSub.stop();
		});

		it("should log error when connection fails", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			const pubSub = new PubSubInvalidator("redis://localhost:6379");
			const cache = createMockCacheManager();
			mockRedis.connect.mockRejectedValue(new Error("Connection refused"));

			await pubSub.start(cache);

			expect(logger.error).toHaveBeenCalledWith(
				"Failed to connect Redis Pub/Sub for cache invalidation",
				expect.any(Object)
			);
			pubSub.stop();
		});

		it("should handle null URL gracefully", async () => {
			const pubSub = new PubSubInvalidator(undefined);
			const cache = createMockCacheManager();

			await pubSub.start(cache);

			expect(mockRedisCtor).not.toHaveBeenCalled();
			pubSub.stop();
		});
	});

	describe("publish", () => {
		it("should not publish when status is not READY", async () => {
			const pubSub = new PubSubInvalidator("redis://localhost:6379");
			mockRedis.status = REDIS_STATUS.CLOSE;

			await pubSub.publish("some-service");

			expect(mockRedis.publish).not.toHaveBeenCalled();
			pubSub.stop();
		});

		it("should publish to cache:invalidate channel when status is READY", async () => {
			const pubSub = new PubSubInvalidator("redis://localhost:6379");
			mockRedis.status = REDIS_STATUS.READY;

			await pubSub.publish("some-service");

			expect(mockRedis.publish).toHaveBeenCalledWith(
				"cache:invalidate",
				"some-service"
			);
			pubSub.stop();
		});

		it("should log warning when publish fails", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			const pubSub = new PubSubInvalidator("redis://localhost:6379");
			mockRedis.status = REDIS_STATUS.READY;
			mockRedis.publish.mockRejectedValue(new Error("Publish error"));

			await pubSub.publish("some-service");

			expect(logger.warn).toHaveBeenCalledWith(
				"Failed to publish cache invalidation",
				expect.any(Object)
			);
			pubSub.stop();
		});
	});

	describe("message handling", () => {
		it("should invalidate cache on cache:invalidate channel message", async () => {
			const pubSub = new PubSubInvalidator("redis://localhost:6379");
			const cache = createMockCacheManager();

			await pubSub.start(cache);

			const messageHandler = mockRedis.on.mock.calls.find(
				(c: unknown[]) => c[0] === "message"
			)?.[1] as (channel: string, msg: string) => void;

			messageHandler("cache:invalidate", "some-service");

			expect(cache.invalidate).toHaveBeenCalledWith("some-service");
			pubSub.stop();
		});

		it("should ignore messages on other channels", async () => {
			const pubSub = new PubSubInvalidator("redis://localhost:6379");
			const cache = createMockCacheManager();

			await pubSub.start(cache);

			const messageHandler = mockRedis.on.mock.calls.find(
				(c: unknown[]) => c[0] === "message"
			)?.[1] as (channel: string, msg: string) => void;

			messageHandler("other-channel", "some-service");

			expect(cache.invalidate).not.toHaveBeenCalled();
			pubSub.stop();
		});
	});

	describe("stop", () => {
		it("should unsubscribe and disconnect", () => {
			const pubSub = new PubSubInvalidator("redis://localhost:6379");

			pubSub.stop();

			expect(mockRedis.unsubscribe).toHaveBeenCalledWith("cache:invalidate");
			expect(mockRedis.disconnect).toHaveBeenCalled();
		});

		it("should handle errors during unsubscribe gracefully", () => {
			const { logger } = require("@trading-model/common/config/logger");
			const pubSub = new PubSubInvalidator("redis://localhost:6379");
			mockRedis.unsubscribe.mockImplementation(() => {
				throw new Error("Unsubscribe error");
			});

			pubSub.stop();

			expect(logger.debug).toHaveBeenCalledWith(
				"PubSub unsubscribe failed during stop"
			);
		});

		it("should handle errors during disconnect gracefully", () => {
			const { logger } = require("@trading-model/common/config/logger");
			const pubSub = new PubSubInvalidator("redis://localhost:6379");
			mockRedis.disconnect.mockImplementation(() => {
				throw new Error("Disconnect error");
			});

			pubSub.stop();

			expect(logger.debug).toHaveBeenCalledWith(
				"PubSub disconnect failed during stop"
			);
		});
	});
});
