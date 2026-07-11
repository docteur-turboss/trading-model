import { describe, expect, it } from "@jest/globals";
import { CrlCache, GLOBAL_CRL_CACHE } from "../../../src/crl/crl-cache";

describe("CrlCache", () => {
	it("should start empty", () => {
		const cache = new CrlCache();
		expect(cache.size).toBe(0);
	});

	it("should add and check revoked serials", () => {
		const cache = new CrlCache();
		cache.addRevoked("abc123" as never);
		expect(cache.isRevoked("abc123" as never)).toBe(true);
		expect(cache.isRevoked("not-revoked" as never)).toBe(false);
	});

	it("should be case insensitive", () => {
		const cache = new CrlCache();
		cache.addRevoked("ABC123" as never);
		expect(cache.isRevoked("abc123" as never)).toBe(true);
	});

	it("should bulk-load from entries", () => {
		const cache = new CrlCache();
		cache.addRevokedFromEntries([
			{ serialNumber: "ser1" as never },
			{ serialNumber: "ser2" as never },
		]);
		expect(cache.size).toBe(2);
		expect(cache.isRevoked("ser1" as never)).toBe(true);
	});

	it("should clear all entries", () => {
		const cache = new CrlCache();
		cache.addRevoked("abc" as never);
		cache.clear();
		expect(cache.size).toBe(0);
		expect(cache.isRevoked("abc" as never)).toBe(false);
	});

	it("should create from CRL entries via static factory", () => {
		const cache = CrlCache.fromCrlEntries([
			{ serialNumber: "s1" as never },
			{ serialNumber: "s2" as never },
		]);
		expect(cache.size).toBe(2);
	});

	it("GLOBAL_CRL_CACHE should be a singleton", () => {
		expect(GLOBAL_CRL_CACHE).toBeInstanceOf(CrlCache);
	});
});
