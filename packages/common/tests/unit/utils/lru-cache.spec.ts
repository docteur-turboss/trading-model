import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { LruCache } from "../../../src/utils/lru-cache";

describe("LruCache", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});
	describe("constructor", () => {
		it("should use default config when none provided", () => {
			const cache = new LruCache<string>();
			expect(cache.size).toBe(0);
		});

		it("should accept custom maxSize and ttlMs", () => {
			const cache = new LruCache<string>({ maxSize: 5, ttlMs: 1000 as never });
			expect(cache.size).toBe(0);
		});

		it("should default ttlMs to 60000 when not provided", () => {
			const cache = new LruCache<string>({ maxSize: 10 });
			cache.set("a", "value");
			expect(cache.get("a")).toBe("value");
		});
	});

	describe("set and get", () => {
		it("should store and retrieve a value", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			cache.set("key1", "value1");
			expect(cache.get("key1")).toBe("value1");
		});

		it("should return undefined for missing key", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			expect(cache.get("nonexistent")).toBeUndefined();
		});

		it("should overwrite existing key", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			cache.set("key", "old");
			cache.set("key", "new");
			expect(cache.get("key")).toBe("new");
		});

		it("should accept custom ttlMs per set call", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			cache.set("key", "value", 5000);
			expect(cache.get("key")).toBe("value");
		});
	});

	describe("has", () => {
		it("should return true for existing key", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			cache.set("key", "value");
			expect(cache.has("key")).toBe(true);
		});

		it("should return false for missing key", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			expect(cache.has("nonexistent")).toBe(false);
		});

		it("should return false for expired key", () => {
			const cache = new LruCache<string>({ maxSize: 10, ttlMs: 1 as never });
			cache.set("key", "value");
			expect(cache.has("key")).toBe(true);
		});
	});

	describe("expiration", () => {
		it("should expire entries after ttlMs", () => {
			const cache = new LruCache<string>({ maxSize: 10, ttlMs: 10 as never });
			cache.set("key", "value");
			expect(cache.get("key")).toBe("value");
			jest.advanceTimersByTime(20);
			expect(cache.get("key")).toBeUndefined();
		});

		it("should not expire entries when ttlMs is 0", () => {
			const cache = new LruCache<string>({ maxSize: 10, ttlMs: 0 as never });
			cache.set("key", "value");
			expect(cache.get("key")).toBe("value");
		});

		it("should use per-key ttl when provided", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			cache.set("short", "value", 10);
			jest.advanceTimersByTime(20);
			expect(cache.get("short")).toBeUndefined();
		});
	});

	describe("eviction", () => {
		it("should evict oldest entry when at maxSize", () => {
			const cache = new LruCache<string>({ maxSize: 2, ttlMs: 0 as never });
			cache.set("a", "1");
			cache.set("b", "2");
			cache.set("c", "3");
			expect(cache.get("a")).toBeUndefined();
			expect(cache.get("b")).toBe("2");
			expect(cache.get("c")).toBe("3");
		});

		it("should not evict when re-setting existing key", () => {
			const cache = new LruCache<string>({ maxSize: 2, ttlMs: 0 as never });
			cache.set("a", "1");
			cache.set("b", "2");
			cache.set("a", "updated");
			expect(cache.get("a")).toBe("updated");
			expect(cache.get("b")).toBe("2");
			expect(cache.size).toBe(2);
		});

		it("should move accessed key to most-recent position", () => {
			const cache = new LruCache<string>({ maxSize: 2, ttlMs: 0 as never });
			cache.set("a", "1");
			cache.set("b", "2");
			cache.get("a");
			cache.set("c", "3");
			expect(cache.get("a")).toBe("1");
			expect(cache.get("b")).toBeUndefined();
			expect(cache.get("c")).toBe("3");
		});
	});

	describe("delete", () => {
		it("should remove a key", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			cache.set("key", "value");
			cache.delete("key");
			expect(cache.get("key")).toBeUndefined();
		});

		it("should not throw when deleting non-existent key", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			expect(() => cache.delete("nonexistent")).not.toThrow();
		});
	});

	describe("clear", () => {
		it("should remove all entries", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			cache.set("a", "1");
			cache.set("b", "2");
			cache.clear();
			expect(cache.size).toBe(0);
			expect(cache.get("a")).toBeUndefined();
			expect(cache.get("b")).toBeUndefined();
		});
	});

	describe("size", () => {
		it("should reflect the number of entries", () => {
			const cache = new LruCache<string>({
				maxSize: 10,
				ttlMs: 60000 as never,
			});
			expect(cache.size).toBe(0);
			cache.set("a", "1");
			expect(cache.size).toBe(1);
			cache.set("b", "2");
			expect(cache.size).toBe(2);
			cache.delete("a");
			expect(cache.size).toBe(1);
		});
	});

	describe("ISyncCache interface compliance", () => {
		it("should implement has method", () => {
			const cache: LruCache<string> = new LruCache({
				maxSize: 10,
				ttlMs: 0 as never,
			});
			cache.set("k", "v");
			expect(cache.has("k")).toBe(true);
		});
	});
});
