import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_APP = { use: jest.fn() };
const MOCK_CREATE_SECURE_SERVER = jest
	.fn<any>()
	.mockReturnValue({ close: jest.fn() });

jest.mock(
	"@trading-model/server-utils/adapters/inbound/service-server-factory",
	() => ({
		createServiceServer: MOCK_CREATE_SECURE_SERVER,
	})
);

jest.mock("config/address-manager", () => ({
	ADDRESS_MANAGER_ROUTES: jest.fn(),
}));

jest.mock("config/message-manager", () => ({
	MESSAGE_MANAGER_ROUTES: jest.fn((app: any) => app),
}));

const MOCK_ENV: Record<string, unknown> = {
	PORT: 3000,
	TLS_KEY_PATH: "/etc/tls/key.pem",
	TLS_CERT_PATH: "/etc/tls/cert.pem",
	TLS_CA_PATH: "/etc/tls/ca.pem",
};
jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: MOCK_ENV,
}));

const MOCK_REDIS = {
	connect: jest.fn<any>(),
	ping: jest.fn<any>(),
	disconnect: jest.fn(),
};
const MOCK_CREATE_REDIS_CLIENT = jest.fn<any>(() => MOCK_REDIS);
jest.mock("@trading-model/persistence/redis-connection-manager", () => ({
	createRedisClient: MOCK_CREATE_REDIS_CLIENT,
}));

import { createServer } from "../../../src/application/server";

function redisReadinessCheck(): () => Promise<boolean> {
	void createServer();
	const options: any = MOCK_CREATE_SECURE_SERVER.mock.calls.at(-1)?.[0];
	return options.readiness.find((r: { name: string }) => r.name === "redis")
		.check;
}

describe("app/server", () => {
	it("should create server", () => {
		const server = createServer();
		expect(server).toBeDefined();
		expect(server.close).toBeDefined();
	});

	it("should call createServiceServer with correct options", () => {
		void createServer();
		expect(MOCK_CREATE_SECURE_SERVER).toHaveBeenCalledWith(
			expect.objectContaining({
				env: expect.objectContaining({
					PORT: 3000,
				}),
				trustProxy: true,
			})
		);
	});

	it("should register routes callback", () => {
		void createServer();
		const options: any = MOCK_CREATE_SECURE_SERVER.mock.calls[0][0];
		expect(typeof options.routes).toBe("function");
		expect(() => options.routes(MOCK_APP)).not.toThrow();
	});

	describe("redis readiness", () => {
		beforeEach(() => {
			delete MOCK_ENV.REDIS_URL;
			delete MOCK_ENV.REDIS_SENTINELS;
			MOCK_CREATE_REDIS_CLIENT.mockClear();
			MOCK_REDIS.disconnect.mockClear();
			MOCK_REDIS.connect.mockResolvedValue(undefined);
			MOCK_REDIS.ping.mockResolvedValue("PONG");
		});

		it("should be ready without Redis configured", async () => {
			await expect(redisReadinessCheck()()).resolves.toBe(true);
			expect(MOCK_CREATE_REDIS_CLIENT).not.toHaveBeenCalled();
		});

		it("should ping the master the sentinels designate", async () => {
			MOCK_ENV.REDIS_SENTINELS =
				"redis-sentinel-0.redis-sentinel-headless:26379,10.0.0.7:26379";

			await expect(redisReadinessCheck()()).resolves.toBe(true);

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

		it("should not be ready when Redis cannot be reached", async () => {
			MOCK_ENV.REDIS_URL = "redis://redis:6379";
			MOCK_REDIS.connect.mockRejectedValue(new Error("ECONNREFUSED"));

			await expect(redisReadinessCheck()()).resolves.toBe(false);
			expect(MOCK_REDIS.disconnect).toHaveBeenCalled();
		});
	});
});
