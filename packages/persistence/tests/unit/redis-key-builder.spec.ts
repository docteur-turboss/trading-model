import { describe, expect, it } from "@jest/globals";
import { buildRedisKey } from "../../src/redis-key-builder";

describe("buildRedisKey", () => {
	it("should join prefix and segments with colons", () => {
		expect(buildRedisKey("app:", "users", "1")).toBe("app:users:1");
	});

	it("should return prefix when no segments", () => {
		expect(buildRedisKey("app:")).toBe("app:");
	});
});
