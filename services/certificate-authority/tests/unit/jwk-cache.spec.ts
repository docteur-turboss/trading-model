import type { KeyObject } from "node:crypto";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { JwkCache } from "../../src/core/jwk-cache";

describe("JwkCache", () => {
	let cache: JwkCache;

	beforeEach(() => {
		jest.clearAllMocks();
		cache = new JwkCache();
	});

	it("should start empty", () => {
		expect(cache.hasKeys()).toBe(false);
		expect(cache.size()).toBe(0);
	});

	it("should require refresh when empty", () => {
		expect(cache.shouldRefresh()).toBe(true);
	});

	it("should not require refresh after update within TTL", () => {
		cache.update([{ kid: "key-1", key: {} as KeyObject }]);
		expect(cache.shouldRefresh()).toBe(false);
	});

	it("should require refresh after TTL expires", () => {
		jest.useFakeTimers();
		cache.update([{ kid: "key-1", key: {} as KeyObject }]);
		jest.advanceTimersByTime(3_600_001);
		expect(cache.shouldRefresh()).toBe(true);
		jest.useRealTimers();
	});

	it("should update with multiple keys", () => {
		cache.update([
			{ kid: "key-1", key: {} as KeyObject },
			{ kid: "key-2", key: {} as KeyObject },
		]);
		expect(cache.size()).toBe(2);
		expect(cache.hasKeys()).toBe(true);
	});

	it("should replace keys on update", () => {
		cache.update([{ kid: "key-1", key: {} as KeyObject }]);
		cache.update([{ kid: "key-2", key: {} as KeyObject }]);
		expect(cache.size()).toBe(1);
		expect(cache.lookupByKid("key-1")).toBeUndefined();
		expect(cache.lookupByKid("key-2")).toBeDefined();
	});

	it("should lookup by kid", () => {
		const key = {} as KeyObject;
		cache.update([{ kid: "my-key", key }]);
		expect(cache.lookupByKid("my-key")).toBe(key);
		expect(cache.lookupByKid("unknown")).toBeUndefined();
	});

	it("should return single key when only one exists", () => {
		const key = {} as KeyObject;
		cache.update([{ kid: "only-key", key }]);
		expect(cache.lookupSingleKey()).toBe(key);
	});

	it("should return undefined for lookupSingleKey when multiple keys exist", () => {
		cache.update([
			{ kid: "key-1", key: {} as KeyObject },
			{ kid: "key-2", key: {} as KeyObject },
		]);
		expect(cache.lookupSingleKey()).toBeUndefined();
	});

	it("should return undefined for lookupSingleKey when cache is empty", () => {
		expect(cache.lookupSingleKey()).toBeUndefined();
	});
});
