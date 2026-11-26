import { describe, expect, it } from "@jest/globals";
import {
	createPoolOptions,
	DEFAULT_MONGO_POOL_OPTIONS,
	mongoAuthFromEnv,
	resolvePoolSize,
} from "../../src/mongo-utils";

describe("DEFAULT_MONGO_POOL_OPTIONS", () => {
	it("should have expected defaults", () => {
		expect(DEFAULT_MONGO_POOL_OPTIONS.maxPoolSize).toBe(50);
		expect(DEFAULT_MONGO_POOL_OPTIONS.minPoolSize).toBe(2);
		expect(DEFAULT_MONGO_POOL_OPTIONS.retryWrites).toBe(true);
		expect(DEFAULT_MONGO_POOL_OPTIONS.socketTimeoutMS).toBe(30_000);
	});
});

describe("resolvePoolSize", () => {
	it("should use provided value", () => {
		expect(resolvePoolSize(25)).toBe(25);
	});

	it("should use env var fallback", () => {
		const original = process.env.MONGO_POOL_SIZE;
		process.env.MONGO_POOL_SIZE = "10";
		expect(resolvePoolSize()).toBe(10);
		process.env.MONGO_POOL_SIZE = original;
	});

	it("should use default when nothing is set", () => {
		const original = process.env.MONGO_POOL_SIZE;
		delete process.env.MONGO_POOL_SIZE;
		expect(resolvePoolSize()).toBe(50);
		process.env.MONGO_POOL_SIZE = original;
	});
});

describe("createPoolOptions", () => {
	it("should create options with pool size", () => {
		const opts = createPoolOptions(20);
		expect(opts.maxPoolSize).toBe(20);
		expect(opts.minPoolSize).toBe(4);
	});

	it("should respect custom minPoolSize", () => {
		const opts = createPoolOptions(20, 10);
		expect(opts.minPoolSize).toBe(10);
	});
});

describe("mongoAuthFromEnv", () => {
	it("returns the pair when both are set, nothing when neither is", () => {
		expect(
			mongoAuthFromEnv({ MONGO_USERNAME: "u", MONGO_PASSWORD: "p" })
		).toEqual({ username: "u", password: "p" });
		expect(mongoAuthFromEnv({})).toBeUndefined();
	});

	it("rejects a half-set pair", () => {
		expect(() => mongoAuthFromEnv({ MONGO_USERNAME: "u" })).toThrow(
			"must be set together"
		);
		expect(() => mongoAuthFromEnv({ MONGO_PASSWORD: "p" })).toThrow(
			"must be set together"
		);
	});
});
