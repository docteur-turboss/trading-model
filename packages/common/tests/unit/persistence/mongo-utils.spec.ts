import { describe, expect, it } from "@jest/globals";
import {
	createPoolOptions,
	DEFAULT_MONGO_POOL_OPTIONS,
	resolvePoolSize,
} from "../../../src/persistence/mongo-utils";

describe("DEFAULT_MONGO_POOL_OPTIONS", () => {
	it("should have expected defaults", () => {
		expect(DEFAULT_MONGO_POOL_OPTIONS.maxPoolSize).toBe(50);
		expect(DEFAULT_MONGO_POOL_OPTIONS.minPoolSize).toBe(2);
		expect(DEFAULT_MONGO_POOL_OPTIONS.retryWrites).toBe(true);
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
