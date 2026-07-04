import { describe, expect, it, jest } from "@jest/globals";

const mockConnect = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const MockRedisInstance = {
	status: "ready",
	connect: mockConnect,
	disconnect: jest.fn(),
	removeAllListeners: jest.fn(),
	on: jest.fn(),
	off: jest.fn(),
	ping: jest.fn<() => Promise<string>>().mockResolvedValue("PONG"),
	multi: jest.fn(() => ({
		exec: jest
			.fn<() => Promise<[Error | null, unknown][]>>()
			.mockResolvedValue([]),
	})),
};

const MockRedis = jest.fn(() => MockRedisInstance);
const MockCluster = jest.fn(() => MockRedisInstance);

jest.mock("ioredis", () => ({
	__esModule: true,
	default: MockRedis,
	Cluster: MockCluster,
	Redis: MockRedis,
}));

jest.mock("../../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../src/config/env", () => ({
	ENV: {},
}));

const BASE_ENV = {
	REDIS_URL: undefined,
	REDIS_HOST: "localhost",
	REDIS_PORT: 6379,
	REDIS_PASSWORD: undefined,
	REDIS_DB: 0,
	REDIS_TLS_ENABLED: false,
	REDIS_MAX_RECONNECT_ATTEMPTS: 10,
	REDIS_PREFIX: "mm:",
	REDIS_SENTINEL_MASTER_NAME: undefined,
	REDIS_SENTINEL_NODES: undefined,
	REDIS_SENTINEL_PASSWORD: undefined,
	REDIS_CLUSTER_NODES: undefined,
};

describe("redis sentinel", () => {
	beforeEach(() => {
		MockRedis.mockClear();
		mockConnect.mockClear();
	});

	it("should create sentinel client", () => {
		jest.isolateModules(() => {
			const env = require("../../../src/config/env");
			Object.assign(env.ENV, BASE_ENV, {
				REDIS_SENTINEL_MASTER_NAME: "mymaster",
				REDIS_SENTINEL_NODES: JSON.stringify([
					{ host: "sentinel-1", port: 26379 },
				]),
			});
			const { getRedisClient } = require("../../../src/config/redis");
			return getRedisClient().then((client: unknown) => {
				expect(client).toBeDefined();
			});
		});
	});

	it("should create sentinel client with TLS", () => {
		jest.isolateModules(() => {
			const env = require("../../../src/config/env");
			Object.assign(env.ENV, BASE_ENV, {
				REDIS_SENTINEL_MASTER_NAME: "mymaster",
				REDIS_SENTINEL_NODES: JSON.stringify([
					{ host: "sentinel-1", port: 26379 },
				]),
				REDIS_TLS_ENABLED: true,
			});
			const { getRedisClient } = require("../../../src/config/redis");
			return getRedisClient().then((client: unknown) => {
				expect(client).toBeDefined();
			});
		});
	});

	it("should handle invalid sentinel nodes JSON", () => {
		jest.isolateModules(() => {
			const env = require("../../../src/config/env");
			Object.assign(env.ENV, BASE_ENV, {
				REDIS_SENTINEL_MASTER_NAME: "mymaster",
				REDIS_SENTINEL_NODES: "not-json",
			});
			const { getRedisClient } = require("../../../src/config/redis");
			return expect(getRedisClient()).rejects.toThrow();
		});
	});
});

describe("redis cluster", () => {
	it("should create cluster client", () => {
		jest.isolateModules(() => {
			const env = require("../../../src/config/env");
			Object.assign(env.ENV, BASE_ENV, {
				REDIS_CLUSTER_NODES: JSON.stringify([
					{ host: "cluster-1", port: 7000 },
				]),
			});
			const { getRedisClient } = require("../../../src/config/redis");
			return getRedisClient().then((client: unknown) => {
				expect(client).toBeDefined();
			});
		});
	});

	it("should handle invalid cluster nodes JSON", () => {
		jest.isolateModules(() => {
			const env = require("../../../src/config/env");
			Object.assign(env.ENV, BASE_ENV, {
				REDIS_CLUSTER_NODES: "bad-json",
			});
			const { getRedisClient } = require("../../../src/config/redis");
			return expect(getRedisClient()).rejects.toThrow();
		});
	});
});

describe("redis sentinel no nodes", () => {
	it("should use default host/port when no sentinel nodes", () => {
		jest.isolateModules(() => {
			const env = require("../../../src/config/env");
			Object.assign(env.ENV, BASE_ENV, {
				REDIS_SENTINEL_MASTER_NAME: "mymaster",
				REDIS_SENTINEL_NODES: undefined,
			});
			const { getRedisClient } = require("../../../src/config/redis");
			return getRedisClient().then((client: unknown) => {
				expect(client).toBeDefined();
			});
		});
	});
});
