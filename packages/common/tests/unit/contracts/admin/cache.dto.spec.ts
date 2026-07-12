import { describe, expect, it } from "@jest/globals";
import {
	CacheStatus,
	fromCacheKey,
	fromDataSize,
	toCacheKey,
	toDataSize,
} from "@trading-model/validation/contracts/admin/cache.dto";

describe("CacheStatus", () => {
	it("should have correct enum values", () => {
		expect(CacheStatus.Active).toBe("active");
		expect(CacheStatus.Expired).toBe("expired");
		expect(CacheStatus.Evicted).toBe("evicted");
		expect(CacheStatus.Unknown).toBe("unknown");
	});
});

describe("CacheKey", () => {
	it("should create with valid value", () => {
		expect(toCacheKey("test-key")).toBe("test-key");
		expect(fromCacheKey("test-key" as never)).toBe("test-key");
	});
});

describe("DataSize", () => {
	it("should create with valid value", () => {
		expect(toDataSize("1MB")).toBe("1MB");
		expect(fromDataSize("1MB" as never)).toBe("1MB");
	});
});
