import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockRedisInstance = {
	on: jest.fn(),
	quit: jest.fn().mockResolvedValue(undefined),
	publish: jest.fn().mockResolvedValue(1),
	subscribe: jest.fn().mockResolvedValue(undefined),
	unsubscribe: jest.fn().mockResolvedValue(undefined),
	duplicate: jest.fn().mockReturnThis(),
	removeListener: jest.fn(),
	get: jest.fn(),
	setex: jest.fn().mockResolvedValue("OK"),
	del: jest.fn().mockResolvedValue(1),
	scan: jest.fn().mockResolvedValue(["0", []]),
};

let currentRetryStrategy: ((times: number) => number | null) | null = null;

jest.mock("ioredis", () => {
	return jest.fn().mockImplementation((_url, opts) => {
		if (opts?.retryStrategy) {
			currentRetryStrategy = opts.retryStrategy;
		}
		return mockRedisInstance;
	});
});

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createCache, NULL_CACHE } from "../../src/persistence/redis-cache";

describe("RedisCache", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		currentRetryStrategy = null;
	});

	it("should create disabled cache when no URL given", () => {
		const cache = createCache();
		expect(cache.isAvailable()).toBe(false);
	});

	it("should create connected cache with URL", () => {
		const cache = createCache("redis://localhost:6379");
		expect(cache.isAvailable()).toBe(true);
	});

	it("should configure retry strategy", () => {
		createCache("redis://localhost:6379");
		expect(currentRetryStrategy).not.toBeNull();
		expect(currentRetryStrategy!(11)).toBeNull();
		expect(currentRetryStrategy!(1)).toBe(1000);
	});

	it("should disconnect", async () => {
		const cache = createCache("redis://localhost:6379");
		await cache.disconnect();
		expect(mockRedisInstance.quit).toHaveBeenCalled();
	});

	it("should return null on get when disabled", async () => {
		const cache = NULL_CACHE;
		const result = await cache.get("key");
		expect(result).toBeNull();
	});

	it("should return null when key not found", async () => {
		mockRedisInstance.get.mockResolvedValue(null);
		const cache = createCache("redis://localhost:6379");
		const result = await cache.get("key");
		expect(result).toBeNull();
	});

	it("should get and parse JSON value", async () => {
		mockRedisInstance.get.mockResolvedValue(JSON.stringify({ data: 42 }));
		const cache = createCache("redis://localhost:6379");
		const result = await cache.get<{ data: number }>("key");
		expect(result).toEqual({ data: 42 });
	});

	it("should set value with TTL", async () => {
		const cache = createCache("redis://localhost:6379");
		await cache.set({ key: "key", value: { foo: "bar" }, ttlMs: 5000 });
		expect(mockRedisInstance.setex).toHaveBeenCalledWith(
			"key",
			5,
			JSON.stringify({ foo: "bar" })
		);
	});

	it("should delete key", async () => {
		const cache = createCache("redis://localhost:6379");
		await cache.delete("key");
		expect(mockRedisInstance.del).toHaveBeenCalledWith("key");
	});

	it("should do nothing when disabled for set", async () => {
		const cache = NULL_CACHE;
		await cache.set({ key: "key", value: "val", ttlMs: 1000 });
		expect(mockRedisInstance.setex).not.toHaveBeenCalled();
	});

	it("should make prefixed key", () => {
		const cache = NULL_CACHE;
		expect(cache.makeKey(["a", "b"])).toBe("ca-cache:a:b");
	});

	it("should clear all cache keys with SCAN", async () => {
		mockRedisInstance.scan
			.mockResolvedValueOnce(["5", ["ca-cache:k1", "ca-cache:k2"]])
			.mockResolvedValueOnce(["0", []]);
		const cache = createCache("redis://localhost:6379");
		await cache.clear();
		expect(mockRedisInstance.scan).toHaveBeenCalled();
		expect(mockRedisInstance.del).toHaveBeenCalledWith(
			"ca-cache:k1",
			"ca-cache:k2"
		);
	});

	it("should handle clear when disabled", async () => {
		const cache = NULL_CACHE;
		await cache.clear();
		expect(mockRedisInstance.scan).not.toHaveBeenCalled();
	});

	it("should handle get errors gracefully", async () => {
		mockRedisInstance.get.mockRejectedValue(new Error("Redis error"));
		const cache = createCache("redis://localhost:6379");
		const result = await cache.get("key");
		expect(result).toBeNull();
	});

	it("should handle set errors gracefully", async () => {
		mockRedisInstance.setex.mockRejectedValue(new Error("Redis error"));
		const cache = createCache("redis://localhost:6379");
		await cache.set({ key: "key", value: "val", ttlMs: 1000 });
	});
});
