import { describe, expect, it } from "@jest/globals";
import { InstanceStore } from "../../src/adapters/outbound/instance-store";
import { RedisInstanceStore } from "../../src/adapters/outbound/redis-instance-store";
import { createDiscoveryApp } from "../../src/config/container";

const CLEANUP_SERVICE_INTERVAL_MS = 15_000;

describe("createDiscoveryApp", () => {
	it("should share the registry through Redis when Redis is configured", () => {
		const app = createDiscoveryApp({
			CLEANUP_SERVICE_INTERVAL_MS,
			REDIS_URL: "redis://localhost:6379",
			SIGNING_SECRET: "secret",
		});
		try {
			expect(app.redisClient).toBeDefined();
			expect(app.registry.instanceStore).toBeInstanceOf(RedisInstanceStore);
		} finally {
			app.redisClient?.disconnect();
		}
	});

	it("should keep the registry in memory without Redis (single replica)", () => {
		const app = createDiscoveryApp({ CLEANUP_SERVICE_INTERVAL_MS });
		expect(app.redisClient).toBeUndefined();
		expect(app.registry.instanceStore).toBeInstanceOf(InstanceStore);
	});
});
