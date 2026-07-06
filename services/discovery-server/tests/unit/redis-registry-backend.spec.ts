import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { HostPort } from "@trading-model/common/domain/service-identity";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

interface MockMulti {
	sadd: jest.Mock;
	set: jest.Mock;
	srem: jest.Mock;
	del: jest.Mock;
	exec: jest.Mock;
}

interface MockRedisInstance {
	on: jest.Mock;
	set: jest.Mock;
	get: jest.Mock;
	sismember: jest.Mock;
	smembers: jest.Mock;
	mget: jest.Mock;
	keys: jest.Mock;
	multi: jest.Mock;
	connect: jest.Mock;
	disconnect: jest.Mock;
}

const MOCK_MULTI: MockMulti = {
	sadd: jest.fn().mockReturnThis(),
	set: jest.fn().mockReturnThis(),
	srem: jest.fn().mockReturnThis(),
	del: jest.fn().mockReturnThis(),
	exec: jest.fn().mockResolvedValue([[null, 1]]),
};

const MOCK_REDIS = Object.assign(jest.fn().mockReturnThis(), {
	on: jest.fn().mockReturnThis(),
	set: jest.fn().mockResolvedValue("OK"),
	get: jest.fn().mockResolvedValue(null),
	sismember: jest.fn().mockResolvedValue(1),
	smembers: jest.fn().mockResolvedValue([]),
	mget: jest.fn().mockResolvedValue([]),
	keys: jest.fn().mockResolvedValue([]),
	multi: jest.fn().mockReturnValue(MOCK_MULTI),
	connect: jest.fn().mockResolvedValue(undefined),
	disconnect: jest.fn().mockResolvedValue(undefined),
}) as unknown as jest.Mock & MockRedisInstance;

const MOCK_REDIS_CTOR = jest.fn(() => MOCK_REDIS);
const MOCK_CLUSTER_CTOR = jest.fn(() => MOCK_REDIS);
jest.mock("ioredis", () => ({
	__esModule: true,
	default: MOCK_REDIS_CTOR,
	Redis: MOCK_REDIS_CTOR,
	Cluster: MOCK_CLUSTER_CTOR,
}));

import { Cluster as ClusterModule } from "ioredis";
import {
	type RedisConnectionConfig,
	RedisRegistryBackend,
} from "../../src/core/redis-registry-backend";

const MOCK_CLUSTER = ClusterModule as unknown as jest.Mock;

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		serviceName: "financial-scraper-service",
		instanceId: "test-instance-1",
		ip: "192.168.1.10",
		port: 8444,
		version: "1.0.0",
		ttl: 30_000,
		protocol: "mtls",
		registeredAt: Date.now() - 1000,
		lastHeartbeat: Date.now() - 500,
		...overrides,
	};
}

describe("RedisRegistryBackend", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_REDIS.multi.mockReturnValue(MOCK_MULTI);
		MOCK_REDIS_CTOR.mockImplementation(() => MOCK_REDIS);
		MOCK_CLUSTER_CTOR.mockImplementation(() => MOCK_REDIS);
	});

	describe("constructor", () => {
		it("should connect with a string URL (legacy mode)", () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			expect(MOCK_REDIS_CTOR).toHaveBeenCalledWith(
				"redis://localhost:6379",
				expect.any(Object)
			);
			expect(MOCK_REDIS.on).toHaveBeenCalledWith("error", expect.any(Function));
			backend.stop();
		});

		it("should connect with single mode config", () => {
			const config: RedisConnectionConfig = {
				mode: "single",
				url: "redis://localhost:6380",
			};
			const backend = new RedisRegistryBackend(config);
			expect(MOCK_REDIS_CTOR).toHaveBeenCalledWith(
				"redis://localhost:6380",
				expect.any(Object)
			);
			backend.stop();
		});

		it("should connect with sentinel mode config", () => {
			const config: RedisConnectionConfig = {
				mode: "sentinel",
				config: {
					sentinels: [{ host: "127.0.0.1", port: 26379 }],
					name: "mymaster",
				},
			};
			new RedisRegistryBackend(config);
			expect(MOCK_REDIS_CTOR).toHaveBeenCalledWith(
				expect.objectContaining({
					sentinels: [{ host: "127.0.0.1", port: 26379 }],
					name: "mymaster",
				})
			);
		});

		it("should connect with cluster mode config", () => {
			const config: RedisConnectionConfig = {
				mode: "cluster",
				config: { nodes: [{ host: "127.0.0.1", port: 7000 }] },
			};
			new RedisRegistryBackend(config);
			expect(MOCK_CLUSTER).toHaveBeenCalled();
		});

		it("should throw for unknown mode", () => {
			const config = { mode: "unknown" } as unknown as RedisConnectionConfig;
			expect(() => new RedisRegistryBackend(config)).toThrow(
				"Unknown Redis connection mode"
			);
		});

		it("should use hash-tag prefix wrapping in cluster mode", () => {
			const config: RedisConnectionConfig = {
				mode: "cluster",
				config: { nodes: [{ host: "127.0.0.1", port: 7000 }] },
			};
			const backend = new RedisRegistryBackend(config, "discovery:");
			(backend as any).registerInstance(makeInstance({ instanceId: "i1" }));
			expect(MOCK_REDIS.set).toHaveBeenCalledWith(
				expect.stringMatching(/^{discovery}:instance:i1:token/),
				expect.any(String),
				"NX"
			);
		});

		it("should log redis connection errors via event handler", () => {
			const { logger } = require("@trading-model/common/config/logger");
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const errorHandler = MOCK_REDIS.on.mock.calls.find(
				(c: unknown[]) => c[0] === "error"
			)?.[1] as (err: Error) => void;
			errorHandler(new Error("ECONNREFUSED"));
			expect(logger.error).toHaveBeenCalledWith(
				"Redis connection error",
				expect.any(Object)
			);
			backend.stop();
		});

		it("should use retryStrategy with exponential backoff", () => {
			new RedisRegistryBackend("redis://localhost:6379");
			const args = MOCK_REDIS_CTOR.mock.calls[0];
			const retryStrategy = (args[1] as any).retryStrategy as (
				times: number
			) => number;
			expect(retryStrategy(1)).toBe(200);
			expect(retryStrategy(100)).toBe(5000);
		});

		it("should use clusterRetryStrategy with exponential backoff", () => {
			const config: RedisConnectionConfig = {
				mode: "cluster",
				config: { nodes: [{ host: "127.0.0.1", port: 7000 }] },
			};
			new RedisRegistryBackend(config);
			const args = MOCK_CLUSTER.mock.calls[0];
			const clusterRetryStrategy = (args[1] as any).clusterRetryStrategy as (
				times: number
			) => number;
			expect(clusterRetryStrategy(1)).toBe(200);
			expect(clusterRetryStrategy(100)).toBe(5000);
		});
	});

	describe("registerInstance", () => {
		it("should register a new instance and return a token", async () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const token = await backend.registerInstance(makeInstance());
			expect(token).toBeDefined();
			expect(typeof token).toBe("string");
			expect(MOCK_REDIS.set).toHaveBeenCalledWith(
				expect.stringContaining(":token"),
				expect.any(String),
				"NX"
			);
			expect(MOCK_MULTI.sadd).toHaveBeenCalled();
			expect(MOCK_MULTI.set).toHaveBeenCalled();
			expect(MOCK_MULTI.exec).toHaveBeenCalled();
		});

		it("should retrieve existing token when NX set fails", async () => {
			MOCK_REDIS.set.mockResolvedValue(null);
			MOCK_REDIS.get.mockResolvedValue("existing-token");
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const token = await backend.registerInstance(makeInstance());
			expect(token).toBe("existing-token");
			expect(MOCK_REDIS.get).toHaveBeenCalledWith(
				expect.stringContaining(":token")
			);
		});

		it("should preserve original registeredAt of existing instance", async () => {
			const originalRegisteredAt = 1000000;
			const existingMetadata = JSON.stringify({
				...makeInstance(),
				registeredAt: originalRegisteredAt,
				lastHeartbeat: 900000,
			});
			MOCK_REDIS.get.mockImplementation((key: string) => {
				if (key.includes(":metadata")) {
					return Promise.resolve(existingMetadata);
				}
				return Promise.resolve("OK");
			});
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			await backend.registerInstance(
				makeInstance({ lastHeartbeat: Date.now() })
			);
			const setCall = MOCK_MULTI.set.mock.calls.find((c: string[]) =>
				c[0].includes(":metadata")
			);
			const stored = JSON.parse(setCall![1]);
			expect(stored.registeredAt).toBe(originalRegisteredAt);
		});

		it("should log warning when existing metadata is corrupt", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			MOCK_REDIS.get.mockResolvedValue("invalid-json");
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			await backend.registerInstance(makeInstance());
			expect(logger.warn).toHaveBeenCalledWith(
				"Failed to parse existing instance metadata",
				expect.any(Object)
			);
		});

		it("should preserve the provided registeredAt value", async () => {
			const registeredAt = 5000000;
			MOCK_REDIS.set.mockResolvedValue("OK");
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			await backend.registerInstance(makeInstance({ registeredAt }));
			const setCall = MOCK_MULTI.set.mock.calls.find((c: string[]) =>
				c[0].includes(":metadata")
			);
			const stored = JSON.parse(setCall![1]);
			expect(stored.registeredAt).toBe(registeredAt);
		});

		it("should use current time when registeredAt is null", async () => {
			MOCK_REDIS.set.mockResolvedValue("OK");
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			await backend.registerInstance(
				makeInstance({ registeredAt: null as any })
			);
			const setCall = MOCK_MULTI.set.mock.calls.find((c: string[]) =>
				c[0].includes(":metadata")
			);
			const stored = JSON.parse(setCall![1]);
			expect(typeof stored.registeredAt).toBe("number");
		});

		it("should return generated token when existing token lookup returns null", async () => {
			MOCK_REDIS.set.mockResolvedValue(null);
			MOCK_REDIS.get.mockResolvedValue(null);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const token = await backend.registerInstance(makeInstance());
			expect(token).toBeDefined();
			expect(typeof token).toBe("string");
		});
	});

	describe("updateHeartbeat", () => {
		it("should update heartbeat and return TTL", async () => {
			MOCK_REDIS.sismember.mockResolvedValue(1);
			MOCK_REDIS.get.mockResolvedValue(
				JSON.stringify(makeInstance({ ttl: 30000 }))
			);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.updateHeartbeat(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBe(30000);
			expect(MOCK_MULTI.set).toHaveBeenCalledTimes(2);
		});

		it("should return false when instance is not a member", async () => {
			MOCK_REDIS.sismember.mockResolvedValue(0);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.updateHeartbeat(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBe(false);
		});

		it("should return false when metadata is missing", async () => {
			MOCK_REDIS.sismember.mockResolvedValue(1);
			MOCK_REDIS.get.mockResolvedValue(null);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.updateHeartbeat(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBe(false);
		});

		it("should log warning and return false on corrupt metadata", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			MOCK_REDIS.sismember.mockResolvedValue(1);
			MOCK_REDIS.get.mockResolvedValue("not-json");
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.updateHeartbeat(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBe(false);
			expect(logger.warn).toHaveBeenCalledWith(
				"Failed to update heartbeat in Redis",
				expect.any(Object)
			);
		});
	});

	describe("updateToken", () => {
		it("should set a new token and return it", async () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const token = await backend.updateToken("test-instance-1");
			expect(token).toBeDefined();
			expect(MOCK_REDIS.set).toHaveBeenCalledWith(
				expect.stringContaining(":token"),
				token
			);
		});
	});

	describe("getInstances", () => {
		it("should return empty array when no instance IDs exist", async () => {
			MOCK_REDIS.smembers.mockResolvedValue([]);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const instances = await backend.getInstances("financial-scraper-service");
			expect(instances).toEqual([]);
		});

		it("should return parsed instances", async () => {
			const inst = makeInstance();
			MOCK_REDIS.smembers.mockResolvedValue(["test-instance-1"]);
			MOCK_REDIS.mget.mockResolvedValue([JSON.stringify(inst)]);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const instances = await backend.getInstances("financial-scraper-service");
			expect(instances).toHaveLength(1);
			expect(instances[0].instanceId).toBe("test-instance-1");
		});

		it("should skip corrupt entries with a warning", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			MOCK_REDIS.smembers.mockResolvedValue(["i1", "i2"]);
			MOCK_REDIS.mget.mockResolvedValue([
				JSON.stringify(makeInstance({ instanceId: "i1" })),
				"corrupt",
			]);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const instances = await backend.getInstances("financial-scraper-service");
			expect(instances).toHaveLength(1);
			expect(logger.warn).toHaveBeenCalledWith(
				"Skipping corrupt instance entry in Redis",
				expect.any(Object)
			);
		});

		it("should skip null entries from mget", async () => {
			MOCK_REDIS.smembers.mockResolvedValue(["i1"]);
			MOCK_REDIS.mget.mockResolvedValue([null]);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const instances = await backend.getInstances("financial-scraper-service");
			expect(instances).toEqual([]);
		});
	});

	describe("getInstance", () => {
		it("should return an instance when found", async () => {
			const inst = makeInstance();
			MOCK_REDIS.get.mockResolvedValue(JSON.stringify(inst));
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.getInstance(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBeDefined();
			expect(result!.instanceId).toBe("test-instance-1");
		});

		it("should return undefined when not found", async () => {
			MOCK_REDIS.get.mockResolvedValue(null);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.getInstance(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBeUndefined();
		});

		it("should return undefined and log warning on corrupt data", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			MOCK_REDIS.get.mockResolvedValue("not-json");
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.getInstance(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBeUndefined();
			expect(logger.warn).toHaveBeenCalledWith(
				"Failed to parse instance metadata from Redis",
				expect.any(Object)
			);
		});
	});

	describe("removeInstance", () => {
		it("should remove an instance and return true", async () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.removeInstance({
				serviceName: "financial-scraper-service",
				instanceId: "test-instance-1",
			});
			expect(result).toBe(true);
			expect(MOCK_MULTI.srem).toHaveBeenCalledWith(
				expect.stringContaining(":service:financial-scraper-service:instances"),
				"test-instance-1"
			);
			expect(MOCK_MULTI.del).toHaveBeenCalledTimes(3);
		});

		it("should return false when multi.exec returns null", async () => {
			MOCK_MULTI.exec.mockResolvedValue(null);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.removeInstance(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBe(false);
		});

		it("should return false when srem result count is not 1", async () => {
			MOCK_MULTI.exec.mockResolvedValue([[null, 0]]);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.removeInstance(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBe(false);
		});
	});

	describe("listServiceNames", () => {
		it("should return parsed service names from keys", async () => {
			MOCK_REDIS.keys.mockResolvedValue([
				"discovery:service:financial-scraper-service:instances",
				"discovery:service:message-delivery-service:instances",
			]);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const names = await backend.listServiceNames();
			expect(names).toEqual([
				"financial-scraper-service",
				"message-delivery-service",
			]);
		});

		it("should return empty array when no keys exist", async () => {
			MOCK_REDIS.keys.mockResolvedValue([]);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const names = await backend.listServiceNames();
			expect(names).toEqual([]);
		});

		it("should skip non-matching key patterns", async () => {
			MOCK_REDIS.keys.mockResolvedValue([
				"discovery:service:financial-scraper-service:instances",
				"some:other:key",
			]);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const names = await backend.listServiceNames();
			expect(names).toEqual(["financial-scraper-service"]);
		});
	});

	describe("dump", () => {
		it("should return empty object when no services exist", async () => {
			MOCK_REDIS.keys.mockResolvedValue([]);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const snapshot = await backend.dump();
			expect(snapshot).toEqual({});
		});

		it("should return snapshot of all instances grouped by service", async () => {
			MOCK_REDIS.keys.mockResolvedValue([
				"discovery:service:financial-scraper-service:instances",
			]);
			MOCK_REDIS.smembers.mockResolvedValue(["i1"]);
			MOCK_REDIS.mget.mockResolvedValue([JSON.stringify(makeInstance())]);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const snapshot = await backend.dump();
			expect(snapshot["financial-scraper-service"]).toHaveLength(1);
		});
	});

	describe("generateInstanceToken", () => {
		it("should return a 4-part token", () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const token = backend.generateInstanceToken("test-instance-1");
			expect(token.split(".")).toHaveLength(4);
		});
	});

	describe("validInstanceToken", () => {
		it("should return true for a valid token", async () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const token = backend.generateInstanceToken("test-instance-1");
			MOCK_REDIS.get.mockResolvedValue(token);
			const result = await backend.validInstanceToken({ token, instanceId: "test-instance-1" });
			expect(result).toBe(true);
		});

		it("should return false for token with wrong part count", async () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.validInstanceToken({
				token: "invalid",
				instanceId: "test-instance-1",
			});
			expect(result).toBe(false);
		});

		it("should return false when decodedId does not match instanceId", async () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const result = await backend.validInstanceToken({
				token: "dGVzdC1pbnN0YW5jZS0x.dGVzdA.dGVzdA.dGVzdA",
				instanceId: "wrong-id",
			});
			expect(result).toBe(false);
		});

		it("should return false for invalid HMAC signature", async () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const token = backend.generateInstanceToken("test-instance-1");
			const parts = token.split(".");
			const tampered = `${parts[0]}.${parts[1]}.${parts[2]}.${"a".repeat(43)}`;
			MOCK_REDIS.get.mockResolvedValue(tampered);
			const result = await backend.validInstanceToken({
				token: tampered,
				instanceId: "test-instance-1",
			});
			expect(result).toBe(false);
		});

		it("should return false when stored token differs", async () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const token = backend.generateInstanceToken("test-instance-1");
			MOCK_REDIS.get.mockResolvedValue("different-stored-token");
			const result = await backend.validInstanceToken({ token, instanceId: "test-instance-1" });
			expect(result).toBe(false);
		});

		it("should log warning when timingSafeEqual throws", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			const token = backend.generateInstanceToken("test-instance-1");
			const parts = token.split(".");
			const badSignature = "a".repeat(100);
			const badToken = `${parts[0]}.${parts[1]}.${parts[2]}.${badSignature}`;
			MOCK_REDIS.get.mockResolvedValue(badToken);
			const result = await backend.validInstanceToken({
				token: badToken,
				instanceId: "test-instance-1",
			});
			expect(result).toBe(false);
			expect(logger.warn).toHaveBeenCalledWith(
				"Token validation failed",
				expect.any(Object)
			);
		});
	});

	describe("verifyInstanceName", () => {
		it("should return true for known service names", () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			expect(backend.verifyInstanceName("financial-scraper-service")).toBe(
				true
			);
			expect(backend.verifyInstanceName("discovery-service")).toBe(true);
		});

		it("should return false for unknown service names", () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			expect(backend.verifyInstanceName("unknown-service")).toBe(false);
		});
	});

	describe("lifecycle", () => {
		beforeEach(() => {
			jest.useFakeTimers();
			MOCK_REDIS.connect.mockResolvedValue(undefined);
			MOCK_REDIS.keys.mockResolvedValue([]);
			MOCK_REDIS.smembers.mockResolvedValue([]);
			MOCK_REDIS.mget.mockResolvedValue([]);
			MOCK_MULTI.exec.mockResolvedValue([[null, 1]]);
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it("start should connect and set up cleanup interval", () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			backend.start();
			expect(MOCK_REDIS.connect).toHaveBeenCalled();
		});

		it("stop should disconnect and clear cleanup interval", () => {
			const origRandom = Math.random;
			Math.random = jest.fn(() => 0);
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			backend.start();
			jest.advanceTimersByTime(0);
			backend.stop();
			expect(MOCK_REDIS.disconnect).toHaveBeenCalled();
			Math.random = origRandom;
		});

		it("should log error if connecting fails", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			MOCK_REDIS.connect.mockRejectedValue(new Error("Connection refused"));
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			backend.start();
			await Promise.resolve();
			expect(logger.error).toHaveBeenCalledWith(
				"Failed to connect to Redis",
				expect.any(Object)
			);
		});

		it("should run cleanup on interval after initial delay", () => {
			const origRandom = Math.random;
			Math.random = jest.fn(() => 0);

			const backend = new RedisRegistryBackend("redis://localhost:6379");
			backend.start();

			jest.advanceTimersByTime(0);

			expect((backend as any)._cleaner.isRunning).toBe(true);

			Math.random = origRandom;
		});

		it("should clean up expired instances via interval", async () => {
			jest.useRealTimers();

			MOCK_REDIS.keys.mockResolvedValue([
				"discovery:service:financial-scraper-service:instances",
			]);
			MOCK_REDIS.smembers.mockResolvedValue(["i1"]);
			const oldInstance = makeInstance({
				instanceId: "i1",
				lastHeartbeat: Date.now() - 100000,
				ttl: 5000,
			});
			MOCK_REDIS.mget.mockResolvedValue([JSON.stringify(oldInstance)]);

			const { logger } = require("@trading-model/common/config/logger");
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			await backend.forceCleanup();

			expect(logger.warn).toHaveBeenCalledWith(
				"Expired instance removed",
				expect.objectContaining({ instanceId: "i1" })
			);
		});

		it("should not remove non-expired instances", async () => {
			jest.useRealTimers();

			MOCK_REDIS.keys.mockResolvedValue([
				"discovery:service:financial-scraper-service:instances",
			]);
			MOCK_REDIS.smembers.mockResolvedValue(["i1"]);
			const freshInstance = makeInstance({
				instanceId: "i1",
				lastHeartbeat: Date.now(),
				ttl: 30000,
			});
			MOCK_REDIS.mget.mockResolvedValue([JSON.stringify(freshInstance)]);

			const { logger } = require("@trading-model/common/config/logger");
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			await backend.forceCleanup();

			expect(logger.warn).not.toHaveBeenCalledWith(
				"Expired instance removed",
				expect.anything()
			);
		});

		it("should log error if cleanup throws", async () => {
			const origRandom = Math.random;
			Math.random = jest.fn(() => 0);

			const { logger } = require("@trading-model/common/config/logger");
			MOCK_REDIS.keys.mockRejectedValue(new Error("Redis error"));
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			backend.start();

			jest.advanceTimersByTime(10000);
			for (let i = 0; i < 10; i++) {
				await Promise.resolve();
			}

			expect(logger.error).toHaveBeenCalledWith(
				"Redis cleanup error",
				expect.any(Object)
			);

			Math.random = origRandom;
		});

		it("stop should be safe to call multiple times", () => {
			const backend = new RedisRegistryBackend("redis://localhost:6379");
			backend.stop();
			backend.stop();
			expect(MOCK_REDIS.disconnect).toHaveBeenCalledTimes(2);
		});
	});
});

