import { describe, expect, it } from "@jest/globals";
import { CacheStatus } from "@trading-model/validation/adapters/inbound/admin/cache.dto";

describe("CacheStatus", () => {
	it("should have correct enum values", () => {
		expect(CacheStatus.Active).toBe("active");
		expect(CacheStatus.Expired).toBe("expired");
		expect(CacheStatus.Evicted).toBe("evicted");
		expect(CacheStatus.Unknown).toBe("unknown");
	});
});
