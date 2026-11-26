import { describe, expect, it, jest } from "@jest/globals";

const MOCK_CREATE_SERVER = jest.fn<(...args: any[]) => any>();
jest.mock("@trading-model/http/service-server-factory", () => ({
	createServiceServer: MOCK_CREATE_SERVER,
}));
jest.mock("../../src/config/address-manager", () => ({}));
jest.mock("../../src/config/metrics", () => ({ metricsHandler: jest.fn() }));
jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: { REDIS_URL: "redis://redis:6379" },
}));

const MOCK_REDIS = {
	connect: jest.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
	ping: jest.fn<(...args: any[]) => any>(),
	disconnect: jest.fn<(...args: any[]) => any>(),
};
jest.mock("@trading-model/persistence/redis-connection-manager", () => ({
	createRedisClient: () => MOCK_REDIS,
}));

import { createServer } from "../../src/application/server";

describe("model-evaluator readiness", () => {
	function redisCheck(): () => Promise<boolean> {
		void createServer();
		return MOCK_CREATE_SERVER.mock.calls[0][0].readiness.find(
			(r: { name: string }) => r.name === "redis"
		).check;
	}

	it("should be ready when the bus Redis answers", async () => {
		MOCK_REDIS.ping.mockResolvedValue("PONG");
		await expect(redisCheck()()).resolves.toBe(true);
	});

	it("should not be ready when the bus Redis ping is rejected", async () => {
		MOCK_REDIS.ping.mockRejectedValue(new Error("ECONNREFUSED"));
		await expect(redisCheck()()).rejects.toThrow("ECONNREFUSED");
	});
});
