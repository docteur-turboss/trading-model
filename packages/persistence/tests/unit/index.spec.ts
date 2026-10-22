import { describe, expect, it } from "@jest/globals";
import * as persistence from "../../src/index";

describe("persistence/index", () => {
	it("should export ConnectionManager", () => {
		expect(persistence.ConnectionManager).toBeDefined();
	});

	it("should export DEFAULT_CONNECTION_OPTIONS", () => {
		expect(persistence.DEFAULT_CONNECTION_OPTIONS).toBeDefined();
	});

	it("should export createPoolOptions", () => {
		expect(typeof persistence.createPoolOptions).toBe("function");
	});

	it("should export resolvePoolSize", () => {
		expect(typeof persistence.resolvePoolSize).toBe("function");
	});

	it("should export MemoryStoreAdapter", () => {
		expect(persistence.MemoryStoreAdapter).toBeDefined();
	});

	it("should export MongoConnectionManager", () => {
		expect(persistence.MongoConnectionManager).toBeDefined();
	});

	it("should export MongoStoreBase", () => {
		expect(persistence.MongoStoreBase).toBeDefined();
	});

	it("should export DEFAULT_MONGO_POOL_OPTIONS", () => {
		expect(persistence.DEFAULT_MONGO_POOL_OPTIONS).toBeDefined();
	});

	it("should export findPaginated", () => {
		expect(typeof persistence.findPaginated).toBe("function");
	});

	it("should export RedisClientBuilder", () => {
		expect(persistence.RedisClientBuilder).toBeDefined();
	});

	it("should export createRedisClient", () => {
		expect(typeof persistence.createRedisClient).toBe("function");
	});

	it("should export createRedisConnectionManager", () => {
		expect(typeof persistence.createRedisConnectionManager).toBe("function");
	});

	it("should export buildRedisKey", () => {
		expect(typeof persistence.buildRedisKey).toBe("function");
	});

	it("should export extendRedisKey", () => {
		expect(typeof persistence.extendRedisKey).toBe("function");
	});

	it("should export RedisKeyBuilder", () => {
		expect(persistence.RedisKeyBuilder).toBeDefined();
	});
});
