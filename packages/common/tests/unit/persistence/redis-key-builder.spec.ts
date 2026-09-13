import { describe, expect, it } from "@jest/globals";
import {
	buildRedisKey,
	extendRedisKey,
	RedisKeyBuilder,
} from "../../../src/persistence/redis-key-builder";

describe("buildRedisKey", () => {
	it("should join prefix and segments with colons", () => {
		expect(buildRedisKey("app:", "users", "1")).toBe("app:users:1");
	});

	it("should return prefix when no segments", () => {
		expect(buildRedisKey("app:")).toBe("app:");
	});
});

describe("extendRedisKey", () => {
	it("should concatenate prefix and suffix", () => {
		expect(extendRedisKey("app:users:", "active")).toBe("app:users:active");
	});
});

describe("RedisKeyBuilder", () => {
	it("should build keys with the prefix", () => {
		const builder = new RedisKeyBuilder("app:");
		expect(builder.key("users", "1")).toBe("app:users:1");
	});

	it("should build prefix-only key", () => {
		const builder = new RedisKeyBuilder("app:");
		expect(builder.key()).toBe("app:");
	});

	it("should create a derived builder with an extended prefix", () => {
		const builder = new RedisKeyBuilder("app:");
		const derived = builder.withSuffix("users:");
		expect(derived.key("1")).toBe("app:users:1");
		expect(builder.key("1")).toBe("app:1");
	});
});
