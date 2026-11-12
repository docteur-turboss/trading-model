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
				username: undefined,
				sentinelPassword: undefined,
			},
		});
	});

	it("should carry the ACL user and the sentinel password", () => {
		expect(
			redisConnectionFromEnv({
				REDIS_SENTINELS: "10.0.0.7:26379",
				REDIS_USERNAME: "discovery",
				REDIS_PASSWORD: "service-pw",
				REDIS_SENTINEL_PASSWORD: "sentinel-pw",
			})
		).toMatchObject({
			mode: "sentinel",
			config: {
				username: "discovery",
				password: "service-pw",
				sentinelPassword: "sentinel-pw",
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
				username: undefined,
				sentinelPassword: undefined,
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

	it("should keep clear connections in optional mode, even with a CA", () => {
		const connection = redisConnectionFromEnv({
			REDIS_SENTINELS: K8S_SENTINELS,
			REDIS_TLS_MODE: "optional",
			REDIS_TLS_CA: "/etc/redis-tls/ca.crt",
		});
		expect(connection).toMatchObject({ mode: "sentinel" });
		expect(connection).not.toHaveProperty("config.tls", expect.anything());
	});

	it("should turn TLS on in required mode, with the default server name", () => {
		expect(
			redisConnectionFromEnv({
				REDIS_URL: "redis://redis:6380",
				REDIS_TLS_MODE: "required",
				REDIS_TLS_CA: "/etc/redis-tls/ca.crt",
			})
		).toMatchObject({
			mode: "single",
			tls: { caPath: "/etc/redis-tls/ca.crt", servername: "redis" },
		});
	});

	it("should refuse required mode without a CA and an unknown mode", () => {
		expect(() =>
			redisConnectionFromEnv({
				REDIS_URL: "redis://r:1",
				REDIS_TLS_MODE: "required",
			})
		).toThrow("REDIS_TLS_CA");
		expect(() =>
			redisConnectionFromEnv({ REDIS_URL: "redis://r:1", REDIS_TLS_MODE: "on" })
		).toThrow("optional or required");
	});

	it("should leave Redis off when nothing is configured", () => {
		expect(redisConnectionFromEnv({ REDIS_URL: "" })).toBeUndefined();
		expect(redisConnectionFromEnv({})).toBeUndefined();
	});
});
