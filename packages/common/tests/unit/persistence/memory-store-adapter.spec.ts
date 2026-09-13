import { describe, expect, it, jest } from "@jest/globals";
import { MemoryStoreAdapter } from "../../../src/persistence/memory-store-adapter";

describe("MemoryStoreAdapter", () => {
	it("should return null for missing keys", async () => {
		const store = new MemoryStoreAdapter<string>();
		await expect(store.get("missing")).resolves.toBeNull();
	});

	it("should set and get values", async () => {
		const store = new MemoryStoreAdapter<string>();
		await store.set("a", "value");
		await expect(store.get("a")).resolves.toBe("value");
	});

	it("should overwrite existing values", async () => {
		const store = new MemoryStoreAdapter<string>();
		await store.set("a", "one");
		await store.set("a", "two");
		await expect(store.get("a")).resolves.toBe("two");
	});

	it("should delete keys", async () => {
		const store = new MemoryStoreAdapter<string>();
		await store.set("a", "value");
		await store.delete("a");
		await expect(store.get("a")).resolves.toBeNull();
	});

	it("should clear all keys", async () => {
		const store = new MemoryStoreAdapter<string>();
		await store.set("a", "1");
		await store.set("b", "2");
		await store.clear();
		await expect(store.get("a")).resolves.toBeNull();
		await expect(store.get("b")).resolves.toBeNull();
	});

	it("should expire entries after ttl", async () => {
		jest.useFakeTimers();
		const store = new MemoryStoreAdapter<string>();
		await store.set("a", "value", 1000);
		jest.advanceTimersByTime(1001);
		await expect(store.get("a")).resolves.toBeNull();
		jest.useRealTimers();
	});

	it("should not expire entries when no ttl is given", async () => {
		jest.useFakeTimers();
		const store = new MemoryStoreAdapter<string>();
		await store.set("a", "value");
		jest.advanceTimersByTime(60_000);
		await expect(store.get("a")).resolves.toBe("value");
		jest.useRealTimers();
	});
});
