import { describe, expect, it, jest } from "@jest/globals";

const mockConnect = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDisconnect = jest.fn();
const mockRemoveAllListeners = jest.fn();
const mockOn = jest.fn();
const mockOff = jest.fn();

const MockRedisInstance = {
	status: "ready",
	connect: mockConnect,
	disconnect: mockDisconnect,
	removeAllListeners: mockRemoveAllListeners,
	on: mockOn,
	off: mockOff,
	ping: jest.fn<() => Promise<string>>().mockResolvedValue("PONG"),
	multi: jest.fn(() => ({
		exec: jest
			.fn<() => Promise<[Error | null, unknown][]>>()
			.mockResolvedValue([]),
	})),
};

const MockRedis = jest.fn(() => MockRedisInstance);

jest.mock("ioredis", () => ({
	__esModule: true,
	default: MockRedis,
	Cluster: jest.fn(),
	Redis: MockRedis,
}));

jest.mock("../../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../src/config/env", () => ({
	ENV: {
		REDIS_URL: "redis://localhost:6379",
		REDIS_PASSWORD: undefined,
		REDIS_TLS_ENABLED: false,
		REDIS_SENTINEL_MASTER_NAME: undefined,
		REDIS_SENTINEL_NODES: undefined,
		REDIS_SENTINEL_PASSWORD: undefined,
		REDIS_CLUSTER_NODES: undefined,
		REDIS_PREFIX: "mm:",
		REDIS_MAX_RECONNECT_ATTEMPTS: 10,
	},
}));

import {
	getRedisClient,
	getRedisOrThrow,
	getStreamClient,
	getSubscriptionClient,
	isRedisAvailable,
	onRedisReconnected,
	removeRedisReconnectedCallback,
} from "../../../src/config/redis";

describe("redis", () => {
	beforeEach(() => {
		MockRedis.mockClear();
		mockConnect.mockClear();
		mockOn.mockClear();
		mockOff.mockClear();
	});

	it("should get redis client", async () => {
		const client = await getRedisClient();
		expect(client).toBeDefined();
		expect(MockRedis).toHaveBeenCalled();
	});

	it("should get stream client", async () => {
		const client = await getStreamClient();
		expect(client).toBeDefined();
	});

	it("should get subscription client", async () => {
		const client = await getSubscriptionClient();
		expect(client).toBeDefined();
	});

	it("should check redis availability", async () => {
		const available = await isRedisAvailable();
		expect(available).toBe(true);
	});

	it("should return false when redis is unavailable", async () => {
		MockRedisInstance.ping.mockRejectedValue(new Error("down"));
		const available = await isRedisAvailable();
		expect(available).toBe(false);
	});

	it("should return client from getRedisOrThrow when ready", async () => {
		await getRedisClient();
		const client = getRedisOrThrow();
		expect(client).toBeDefined();
	});

	it("should re-use cached client on second getRedisClient call", async () => {
		const client1 = await getRedisClient();
		const client2 = await getRedisClient();
		expect(client1).toBe(client2);
	});

	it("should handle onRedisReconnected and removeRedisReconnectedCallback", () => {
		const cb = jest.fn();
		onRedisReconnected(cb);
		removeRedisReconnectedCallback(cb);
	});

	it("should handle removing non-existent callback", () => {
		removeRedisReconnectedCallback(jest.fn());
	});

	it("should throw from getRedisOrThrow if not ready", async () => {
		jest.isolateModules(() => {
			const {
				getRedisOrThrow: throwIfNotReady,
			} = require("../../../src/config/redis");
			expect(() => throwIfNotReady()).toThrow("Redis is not available");
		});
	});
});
