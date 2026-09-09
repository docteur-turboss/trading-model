import { describe, expect, it, jest } from "@jest/globals";

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn(),
	Cluster: jest.fn(),
	Redis: jest.fn(),
}));

jest.mock(
	"../../../src/config/logger",
	() => {
		return {
			logger: {
				info: jest.fn(),
				warn: jest.fn(),
				error: jest.fn(),
				debug: jest.fn(),
			},
		};
	},
	{ virtual: false }
);

describe("redis-client-factory", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("redisRetryDelay", () => {
		it("should return null when max attempts is 0", () => {
			jest.isolateModules(() => {
				const env = require("../../../src/infrastructure/config/env");
				env.ENV.REDIS_MAX_RECONNECT_ATTEMPTS = 0;
				const {
					redisRetryDelay,
				} = require("../../../src/config/redis-client-factory");
				expect(redisRetryDelay(0)).toBeNull();
			});
		});
	});

	describe("buildRedisInstance", () => {
		it("should build standalone client when no sentinel or cluster", () => {
			jest.isolateModules(() => {
				const env = require("../../../src/infrastructure/config/env");
				Object.assign(env.ENV, {
					REDIS_URL: "redis://localhost:6379",
					REDIS_TLS_ENABLED: false,
					REDIS_SENTINEL_MASTER_NAME: undefined,
					REDIS_CLUSTER_NODES: undefined,
					REDIS_MAX_RECONNECT_ATTEMPTS: 10,
				});
				const {
					buildRedisInstance,
				} = require("../../../src/config/redis-client-factory");
				const client = buildRedisInstance();
				expect(client).toBeDefined();
			});
		});

		it("should build sentinel client", () => {
			jest.isolateModules(() => {
				const env = require("../../../src/infrastructure/config/env");
				Object.assign(env.ENV, {
					REDIS_SENTINEL_MASTER_NAME: "mymaster",
					REDIS_SENTINEL_NODES: JSON.stringify([
						{ host: "sentinel-1", port: 26379 },
					]),
					REDIS_MAX_RECONNECT_ATTEMPTS: 10,
				});
				const {
					buildRedisInstance,
				} = require("../../../src/config/redis-client-factory");
				const client = buildRedisInstance();
				expect(client).toBeDefined();
			});
		});

		it("should throw on invalid sentinel nodes JSON", () => {
			jest.isolateModules(() => {
				const env = require("../../../src/infrastructure/config/env");
				Object.assign(env.ENV, {
					REDIS_SENTINEL_MASTER_NAME: "mymaster",
					REDIS_SENTINEL_NODES: "not-json",
					REDIS_MAX_RECONNECT_ATTEMPTS: 10,
				});
				const {
					buildRedisInstance,
				} = require("../../../src/config/redis-client-factory");
				expect(() => buildRedisInstance()).toThrow();
			});
		});

		it("should build cluster client when cluster nodes are set", () => {
			jest.isolateModules(() => {
				const env = require("../../../src/infrastructure/config/env");
				Object.assign(env.ENV, {
					REDIS_CLUSTER_NODES: JSON.stringify([
						{ host: "cluster-1", port: 7000 },
					]),
					REDIS_PASSWORD: "clusterpass",
					REDIS_MAX_RECONNECT_ATTEMPTS: 10,
				});
				const {
					buildRedisInstance,
				} = require("../../../src/config/redis-client-factory");
				const client = buildRedisInstance();
				expect(client).toBeDefined();
			});
		});

		it("should throw on invalid cluster nodes JSON", () => {
			jest.isolateModules(() => {
				const env = require("../../../src/infrastructure/config/env");
				Object.assign(env.ENV, {
					REDIS_CLUSTER_NODES: "bad-json",
					REDIS_MAX_RECONNECT_ATTEMPTS: 10,
				});
				const {
					buildRedisInstance,
				} = require("../../../src/config/redis-client-factory");
				expect(() => buildRedisInstance()).toThrow();
			});
		});
	});
});
