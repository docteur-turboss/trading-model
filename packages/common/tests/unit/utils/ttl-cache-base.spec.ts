import { describe, expect, it, jest } from "@jest/globals";
import { TtlCacheBase } from "../../../src/utils/ttl-cache-base";

describe("TtlCacheBase", () => {
	it("should set and get values", () => {
		const cache = new TtlCacheBase<number>(1000);
		cache.set("a", 1);
		expect(cache.get("a")).toBe(1);
	});

	it("should return undefined for missing keys", () => {
		const cache = new TtlCacheBase<number>(1000);
		expect(cache.get("nope")).toBeUndefined();
		expect(cache.has("nope")).toBe(false);
	});

	it("should delete keys", () => {
		const cache = new TtlCacheBase<number>(1000);
		cache.set("a", 1);
		cache.delete("a");
		expect(cache.get("a")).toBeUndefined();
	});

	it("should clear all entries", () => {
		const cache = new TtlCacheBase<number>(1000);
		cache.set("a", 1);
		cache.set("b", 2);
		cache.clear();
		expect(cache.entries()).toEqual([]);
	});

	it("should list entries", () => {
		const cache = new TtlCacheBase<number>(1000);
		cache.set("a", 1);
		cache.set("b", 2);
		expect(cache.entries()).toEqual([
			{ key: "a", value: 1 },
			{ key: "b", value: 2 },
		]);
	});

	it("should close and clear the store", () => {
		const cache = new TtlCacheBase<number>(1000);
		cache.set("a", 1);
		cache.close();
		expect(cache.entries()).toEqual([]);
	});

	it("should treat entries as expired after default ttl", () => {
		jest.useFakeTimers();
		const cache = new TtlCacheBase<number>(1000);
		cache.set("a", 1);
		expect(cache.get("a")).toBe(1);
		jest.advanceTimersByTime(1001);
		expect(cache.get("a")).toBeUndefined();
		expect(cache.has("a")).toBe(false);
		jest.useRealTimers();
	});

	it("should treat entries as expired after a custom ttl", () => {
		jest.useFakeTimers();
		const cache = new TtlCacheBase<number>(10_000);
		cache.set("a", 1, 100);
		jest.advanceTimersByTime(101);
		expect(cache.get("a")).toBeUndefined();
		jest.useRealTimers();
	});

	it("should never expire when ttl is zero", () => {
		jest.useFakeTimers();
		const cache = new TtlCacheBase<number>(0);
		cache.set("a", 1);
		jest.advanceTimersByTime(60_000);
		expect(cache.get("a")).toBe(1);
		jest.useRealTimers();
	});

	it("should not list expired entries", () => {
		jest.useFakeTimers();
		const cache = new TtlCacheBase<number>(1000);
		cache.set("a", 1);
		jest.advanceTimersByTime(1001);
		expect(cache.entries()).toEqual([]);
		jest.useRealTimers();
	});
});
