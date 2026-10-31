import { describe, expect, it } from "@jest/globals";
import { parseRedisNodes, redisConnectionFromEnv } from "../../src/redis-env";

const K8S_SENTINELS =
	"redis-sentinel-0.redis-sentinel-headless:26379, redis-sentinel-1.redis-sentinel-headless:26379";

describe("parseRedisNodes", () => {
	it("should accept DNS names and IP addresses side by side", () => {
		expect(
			parseRedisNodes(
				"redis-sentinel-0.redis-sentinel-headless:26379,10.0.0.7:26380,[::1]:26381"
			)
		).toEqual([
			{ host: "redis-sentinel-0.redis-sentinel-headless", port: 26379 },
			{ host: "10.0.0.7", port: 26380 },
			{ host: "::1", port: 26381 },
		]);
	});

	it("should ignore blanks around and between entries", () => {
		expect(parseRedisNodes(" localhost:26379 ,, ")).toEqual([
			{ host: "localhost", port: 26379 },
		]);
	});

	it.each([
		"redis-sentinel-0",
		"redis-sentinel-0:",
		"::1:26379",
		"bad_host:26379",
		"localhost:99999",
	])("should reject %s", (entry) => {
		expect(() => parseRedisNodes(entry)).toThrow(RangeError);
	});
});

describe("redisConnectionFromEnv", () => {
	it("should go through the sentinels when they are configured", () => {
		expect(
			redisConnectionFromEnv({
				REDIS_SENTINELS: K8S_SENTINELS,
				REDIS_SENTINEL_MASTER_NAME: "trading",
				REDIS_PASSWORD: "secret",
				REDIS_URL: "redis://ignored:6379",
			})
		).toEqual({
			mode: "sentinel",
			config: {
				sentinels: [
					{ host: "redis-sentinel-0.redis-sentinel-headless", port: 26379 },
					{ host: "redis-sentinel-1.redis-sentinel-headless", port: 26379 },
				],
				name: "trading",
				password: "secret",
			},
		});
	});

	it("should monitor mymaster without a password by default", () => {
		expect(
			redisConnectionFromEnv({
				REDIS_SENTINELS: "10.0.0.7:26379",
				REDIS_SENTINEL_MASTER_NAME: "",
				REDIS_PASSWORD: "",
			})
		).toEqual({
			mode: "sentinel",
			config: {
				sentinels: [{ host: "10.0.0.7", port: 26379 }],
				name: "mymaster",
				password: undefined,
			},
		});
	});

	it("should fall back to REDIS_URL without sentinels", () => {
		expect(
			redisConnectionFromEnv({
				REDIS_SENTINELS: " ",
				REDIS_URL: "redis://redis:6379",
			})
		).toEqual({ mode: "single", url: "redis://redis:6379" });
	});

	it("should leave Redis off when nothing is configured", () => {
		expect(redisConnectionFromEnv({ REDIS_URL: "" })).toBeUndefined();
		expect(redisConnectionFromEnv({})).toBeUndefined();
	});
});
