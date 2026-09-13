import { describe, expect, it } from "@jest/globals";
import { invalidateCacheMap } from "../../../src/utils/cache-map-invalidator";

describe("invalidateCacheMap", () => {
	it("should delete keys matching a plain pattern", () => {
		const store = new Map<string, unknown>([
			["users:1", { id: 1 }],
			["users:2", { id: 2 }],
			["orders:1", { id: 1 }],
		]);
		invalidateCacheMap(store, "users:1");
		expect(store.has("users:1")).toBe(false);
		expect(store.has("users:2")).toBe(true);
		expect(store.has("orders:1")).toBe(true);
	});

	it("should delete keys matching a wildcard pattern", () => {
		const store = new Map<string, unknown>([
			["users:1", { id: 1 }],
			["users:2", { id: 2 }],
			["orders:1", { id: 1 }],
		]);
		invalidateCacheMap(store, "users:*");
		expect(store.has("users:1")).toBe(false);
		expect(store.has("users:2")).toBe(false);
		expect(store.has("orders:1")).toBe(true);
	});

	it("should escape regex-special characters in patterns", () => {
		const store = new Map<string, unknown>([["a.b", 1]]);
		invalidateCacheMap(store, "a.b");
		expect(store.has("a.b")).toBe(false);
	});

	it("should keep the map unchanged when nothing matches", () => {
		const store = new Map<string, unknown>([["a", 1]]);
		invalidateCacheMap(store, "missing");
		expect(store.has("a")).toBe(true);
	});

	it("should handle empty maps", () => {
		const store = new Map<string, unknown>();
		invalidateCacheMap(store, "*");
		expect(store.size).toBe(0);
	});
});
