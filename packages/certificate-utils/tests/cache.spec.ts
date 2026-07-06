import { describe, expect, it } from "@jest/globals";
import { LruCache } from "../src/cache";

describe("LruCache", () => {
	it("should return undefined for missing key", () => {
		const cache = new LruCache<string>({ maxSize: 10, ttlMs: 60000 });
		expect(cache.get("missing")).toBeUndefined();
	});

	it("should return undefined for expired entry", () => {
		const cache = new LruCache<string>({ maxSize: 10, ttlMs: -1 });
		cache.set("key", "value");
		expect(cache.get("key")).toBeUndefined();
	});

	it("should return value for existing entry", () => {
		const cache = new LruCache<string>({ maxSize: 10, ttlMs: 60000 });
		cache.set("key", "value");
		expect(cache.get("key")).toBe("value");
	});

	it("should promote accessed entry to MRU position", () => {
		const cache = new LruCache<string>({ maxSize: 2, ttlMs: 60000 });
		cache.set("a", "1");
		cache.set("b", "2");
		cache.get("a");
		cache.set("c", "3");
		expect(cache.get("a")).toBe("1");
		expect(cache.get("b")).toBeUndefined();
		expect(cache.get("c")).toBe("3");
	});

	it("should evict LRU entry when at capacity", () => {
		const cache = new LruCache<string>({ maxSize: 2, ttlMs: 60000 });
		cache.set("a", "1");
		cache.set("b", "2");
		cache.set("c", "3");
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe("2");
		expect(cache.get("c")).toBe("3");
	});

	it("should update existing entry without changing size", () => {
		const cache = new LruCache<string>({ maxSize: 2, ttlMs: 60000 });
		cache.set("a", "1");
		cache.set("a", "2");
		expect(cache.size).toBe(1);
		expect(cache.get("a")).toBe("2");
	});

	it("should clear all entries", () => {
		const cache = new LruCache<string>({ maxSize: 10, ttlMs: 60000 });
		cache.set("a", "1");
		cache.set("b", "2");
		cache.clear();
		expect(cache.size).toBe(0);
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBeUndefined();
	});

	it("should report correct size", () => {
		const cache = new LruCache<string>({ maxSize: 10, ttlMs: 60000 });
		expect(cache.size).toBe(0);
		cache.set("a", "1");
		expect(cache.size).toBe(1);
		cache.set("b", "2");
		expect(cache.size).toBe(2);
		cache.clear();
		expect(cache.size).toBe(0);
	});

	it("should use provided maxSize", () => {
		const cache = new LruCache<string>({ maxSize: 1, ttlMs: 60000 });
		cache.set("a", "1");
		cache.set("b", "2");
		expect(cache.size).toBe(1);
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe("2");
	});

	it("should use default constructor values", () => {
		const cache = new LruCache<string>();
		expect(cache.size).toBe(0);
		cache.set("a", "1");
		expect(cache.size).toBe(1);
		expect(cache.get("a")).toBe("1");
	});

	it("should handle maxSize of 0 gracefully", () => {
		const cache = new LruCache<string>({ maxSize: 0, ttlMs: 60000 });
		cache.set("a", "1");
		expect(cache.size).toBe(1);
		cache.set("b", "2");
		expect(cache.get("a")).toBeUndefined();
		expect(cache.get("b")).toBe("2");
	});
});
