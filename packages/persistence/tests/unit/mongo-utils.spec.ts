import { describe, expect, it, jest } from "@jest/globals";
import {
	createPoolOptions,
	DEFAULT_MONGO_POOL_OPTIONS,
	findPaginated,
	resolvePoolSize,
} from "../../src/mongo-utils";

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

describe("findPaginated", () => {
	it("should chain find/sort/skip/limit/toArray on the collection", async () => {
		const toArray = jest
			.fn<() => Promise<{ _id: string }[]>>()
			.mockResolvedValue([{ _id: "1" }]);
		const limit = jest
			.fn<(n: number) => { toArray: typeof toArray }>()
			.mockReturnValue({ toArray });
		const skip = jest
			.fn<(n: number) => { limit: typeof limit }>()
			.mockReturnValue({ limit });
		const sort = jest
			.fn<(s: Record<string, number>) => { skip: typeof skip }>()
			.mockReturnValue({ skip });
		const find = jest
			.fn<(f: Record<string, unknown>) => { sort: typeof sort }>()
			.mockReturnValue({ sort });
		const collection = { find } as never;

		const docs = await findPaginated(collection, { a: 1 }, { b: -1 }, 5, 10);

		expect(docs).toEqual([{ _id: "1" }]);
		expect(find).toHaveBeenCalledWith({ a: 1 });
		expect(sort).toHaveBeenCalledWith({ b: -1 });
		expect(skip).toHaveBeenCalledWith(5);
		expect(limit).toHaveBeenCalledWith(10);
		expect(toArray).toHaveBeenCalledTimes(1);
	});
});
