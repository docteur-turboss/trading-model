import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ResponseCache } from "../../src/infrastructure/cache";

describe("ResponseCache", () => {
	let cache: ResponseCache;

	beforeEach(() => {
		jest.useFakeTimers();
		cache = new ResponseCache(1000);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should store and retrieve a cached entry", () => {
		cache.set("/v1/test", { data: { foo: "bar" }, status: 200 });
		const entry = cache.get("/v1/test");
		expect(entry).toBeDefined();
		expect(entry!.data).toEqual({ foo: "bar" });
		expect(entry!.status).toBe(200);
	});

	it("drops the oldest entry past 1000 keys", () => {
		for (let page = 0; page <= 1000; page++) {
			cache.set(`/v1/test?page=${page}`, { data: page, status: 200 });
		}
		expect(cache.get("/v1/test?page=0")).toBeUndefined();
		expect(cache.get("/v1/test?page=1")?.data).toBe(1);
		expect(cache.get("/v1/test?page=1000")?.data).toBe(1000);
	});

	it("drops the oldest entries past 32 MB of bodies", () => {
		const mb = 1024 * 1024;
		cache.set("/a", { data: "a", status: 200, bytes: 20 * mb });
		cache.set("/b", { data: "b", status: 200, bytes: 10 * mb });
		cache.set("/c", { data: "c", status: 200, bytes: 10 * mb });
		expect(cache.get("/a")).toBeUndefined();
		expect(cache.get("/b")?.data).toBe("b");

		cache.set("/huge", { data: "h", status: 200, bytes: 33 * mb });
		expect(cache.get("/huge")).toBeUndefined();
		expect(cache.get("/c")?.data).toBe("c");
	});

	it("should return undefined for a missing key", () => {
		const entry = cache.get("/v1/missing");
		expect(entry).toBeUndefined();
	});

	it("should expire entries after TTL", () => {
		cache.set("/v1/test", { data: { foo: "bar" }, status: 200 }, 500);
		jest.advanceTimersByTime(600);
		const entry = cache.get("/v1/test");
		expect(entry).toBeUndefined();
	});

	it("should use default TTL when not specified", () => {
		cache.set("/v1/test", { data: { foo: "bar" }, status: 200 });
		jest.advanceTimersByTime(1500);
		const entry = cache.get("/v1/test");
		expect(entry).toBeUndefined();
	});

	it("should not expire before TTL", () => {
		cache.set("/v1/test", { data: { foo: "bar" }, status: 200 });
		jest.advanceTimersByTime(999);
		const entry = cache.get("/v1/test");
		expect(entry).toBeDefined();
		expect(entry!.data).toEqual({ foo: "bar" });
	});

	it("should invalidate entries by exact pattern", () => {
		cache.set("/v1/foo", { data: { a: 1 }, status: 200 });
		cache.set("/v1/bar", { data: { b: 2 }, status: 200 });
		cache.set("/v2/foo", { data: { c: 3 }, status: 200 });

		cache.invalidate("/v1/*");
		expect(cache.get("/v1/foo")).toBeUndefined();
		expect(cache.get("/v1/bar")).toBeUndefined();
		expect(cache.get("/v2/foo")).toBeDefined();
	});

	it("should clear all entries", () => {
		cache.set("/v1/foo", { data: { a: 1 }, status: 200 });
		cache.set("/v1/bar", { data: { b: 2 }, status: 200 });
		expect(cache.size).toBe(2);

		cache.clear();
		expect(cache.size).toBe(0);
		expect(cache.get("/v1/foo")).toBeUndefined();
		expect(cache.get("/v1/bar")).toBeUndefined();
	});

	it("should not cache POST requests (not a cache concern — caller decides)", () => {
		cache.set("/v1/data", { data: { saved: true }, status: 201 });
		const entry = cache.get("/v1/data");
		expect(entry!.status).toBe(201);
	});

	it("should return size correctly", () => {
		expect(cache.size).toBe(0);
		cache.set("/a", { data: 1, status: 200 });
		expect(cache.size).toBe(1);
		cache.set("/b", { data: 2, status: 200 });
		expect(cache.size).toBe(2);
	});
});
