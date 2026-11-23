import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_REDIS = {
	connect: jest.fn<(...args: any[]) => any>(),
	ping: jest.fn<(...args: any[]) => any>(),
	disconnect: jest.fn<(...args: any[]) => any>(),
};
const MOCK_CREATE_REDIS_CLIENT = jest.fn<(...args: any[]) => any>(
	() => MOCK_REDIS
);
jest.mock("../../src/redis-connection-manager", () => ({
	createRedisClient: MOCK_CREATE_REDIS_CLIENT,
}));

const MOCK_LOGGER = { warn: jest.fn<(...args: any[]) => any>() };
jest.mock("@trading-model/contracts/logger-registry", () => ({
	getLogger: () => MOCK_LOGGER,
}));

import { redisReadinessCheck } from "../../src/redis-readiness";

const REDIS_URL = "redis://redis:6379";

describe("redisReadinessCheck", () => {
	beforeEach(() => {
		MOCK_CREATE_REDIS_CLIENT.mockClear();
		MOCK_REDIS.disconnect.mockClear();
		MOCK_REDIS.connect.mockReset().mockResolvedValue(undefined);
		MOCK_REDIS.ping.mockReset().mockResolvedValue("PONG");
	});

	it("should be ready without Redis configured", async () => {
		await expect(redisReadinessCheck({}).check()).resolves.toBe(true);
		expect(MOCK_CREATE_REDIS_CLIENT).not.toHaveBeenCalled();
	});

	it("should be ready on the HTTP bus, which does not use Redis", async () => {
		const env = { REDIS_URL, BUS_TRANSPORT: "http" as const };
		await expect(redisReadinessCheck(env).check()).resolves.toBe(true);
		expect(MOCK_CREATE_REDIS_CLIENT).not.toHaveBeenCalled();
	});

	it("should ping the master the sentinels designate", async () => {
		const env = {
			REDIS_SENTINELS:
				"redis-sentinel-0.redis-sentinel-headless:26379,10.0.0.7:26379",
		};

		await expect(redisReadinessCheck(env).check()).resolves.toBe(true);

		expect(MOCK_CREATE_REDIS_CLIENT).toHaveBeenCalledWith(
			{
				mode: "sentinel",
				config: expect.objectContaining({
					name: "mymaster",
					sentinels: [
						{ host: "redis-sentinel-0.redis-sentinel-headless", port: 26379 },
						{ host: "10.0.0.7", port: 26379 },
					],
				}),
			},
			expect.objectContaining({ maxRetriesPerRequest: 1 })
		);
		expect(MOCK_REDIS.disconnect).toHaveBeenCalled();
	});

	it("should reject when the ping is rejected twice", async () => {
		MOCK_REDIS.ping.mockRejectedValue(new Error("ECONNREFUSED"));

		// The shared readiness handler reports a throwing check as "error" (503).
		await expect(redisReadinessCheck({ REDIS_URL }).check()).rejects.toThrow(
			"ECONNREFUSED"
		);
		expect(MOCK_REDIS.ping).toHaveBeenCalledTimes(2);
		expect(MOCK_REDIS.disconnect).toHaveBeenCalledTimes(2);
	});

	it("should stay ready after one isolated connect timeout", async () => {
		MOCK_REDIS.connect.mockRejectedValueOnce(new Error("connect ETIMEDOUT"));

		await expect(redisReadinessCheck({ REDIS_URL }).check()).resolves.toBe(
			true
		);
		expect(MOCK_REDIS.connect).toHaveBeenCalledTimes(2);
		expect(MOCK_LOGGER.warn).toHaveBeenCalledWith(
			"Redis readiness ping failed, retrying once",
			{ error: "connect ETIMEDOUT" }
		);
	});
});
