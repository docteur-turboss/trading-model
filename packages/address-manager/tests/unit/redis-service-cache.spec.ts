import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { REDIS_RESP } from "@trading-model/common/persistence/redis-constants";

const MOCK_REDIS_INSTANCE = {
	connect: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(),
	disconnect: jest.fn<(...args: any[]) => void>(),
	get: jest
		.fn<(...args: any[]) => Promise<string | null>>()
		.mockResolvedValue(null),
	setex: jest
		.fn<(...args: any[]) => Promise<string>>()
		.mockResolvedValue(REDIS_RESP.OK),
	del: jest.fn<(...args: any[]) => Promise<number>>().mockResolvedValue(1),
	scan: jest
		.fn<(...args: any[]) => Promise<[string, string[]]>>()
		.mockResolvedValue(["0", []]),
	pipeline: jest.fn<(...args: any[]) => any>(),
	set: jest
		.fn<(...args: any[]) => Promise<string>>()
		.mockResolvedValue(REDIS_RESP.OK),
	on: jest.fn<(...args: any[]) => any>(),
	status: "ready",
	quit: jest.fn<(...args: any[]) => Promise<"OK">>().mockResolvedValue("OK"),
};

jest.mock("ioredis", () => {
	const redisMock = jest.fn(() => MOCK_REDIS_INSTANCE);
	return {
		__esModule: true,
		default: redisMock,
		Redis: redisMock,
		Cluster: jest.fn(() => MOCK_REDIS_INSTANCE),
	};
});

import { CircuitState as CircuitStateEnum } from "@trading-model/common/domain/circuit-state";
import {
	PositiveInt,
	Region,
	toInstanceId,
	toServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { RedisServiceCache } from "../../src/discovery/redis-service-cache";

describe("RedisServiceCache", () => {
	let cache: RedisServiceCache;

	beforeEach(() => {
		jest.clearAllMocks();
		cache = new RedisServiceCache({
			redisUrl: "redis://localhost:6379",
			prefix: "discovery:cache:",
			ttlMs: 5000 as never,
		});
	});

	describe("set / get", () => {
		it("should store instance with TTL in seconds", async () => {
			MOCK_REDIS_INSTANCE.setex.mockResolvedValue(REDIS_RESP.OK);
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(
				JSON.stringify({
					serviceName: "svc",
					instanceId: toInstanceId("i-1"),
					host: "127.0.0.1",
					port: 8080,
				})
			);

			await cache.set({
				serviceName: toServiceId("svc"),
				instance: {
					serviceName: "svc",
					instanceId: toInstanceId("i-1"),
					host: "127.0.0.1",
					port: 8080,
				} as any,
			});
			const result = await cache.get(toServiceId("svc"));

			expect(MOCK_REDIS_INSTANCE.setex).toHaveBeenCalledWith(
				"discovery:cache:svc",
				5,
				expect.any(String)
			);
			expect(result).not.toBeNull();
		});

		it("should return null when key not found", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(null);
			const result = await cache.get(toServiceId("nonexistent"));
			expect(result).toBeNull();
		});

		it("should use region-prefixed keys when region provided", async () => {
			MOCK_REDIS_INSTANCE.setex.mockResolvedValue(REDIS_RESP.OK);
			await cache.set({
				serviceName: toServiceId("svc"),
				instance: { serviceName: "svc" } as any,
				region: Region.of("us-east"),
			});
			expect(MOCK_REDIS_INSTANCE.setex).toHaveBeenCalledWith(
				"discovery:cache:svc::us-east",
				expect.any(Number),
				expect.any(String)
			);
		});

		it("should return null on Redis error", async () => {
			MOCK_REDIS_INSTANCE.get.mockRejectedValue(new Error("Connection lost"));
			const result = await cache.get(toServiceId("svc"));
			expect(result).toBeNull();
		});
	});

	describe("delete", () => {
		it("should delete key from Redis", async () => {
			MOCK_REDIS_INSTANCE.del.mockResolvedValue(1);
			await cache.invalidate(toServiceId("svc"));
			expect(MOCK_REDIS_INSTANCE.del).toHaveBeenCalledWith(
				"discovery:cache:svc"
			);
		});

		it("should handle errors gracefully", async () => {
			MOCK_REDIS_INSTANCE.del.mockRejectedValue(new Error("error"));
			await expect(
				cache.invalidate(toServiceId("svc"))
			).resolves.toBeUndefined();
		});
	});

	describe("clear", () => {
		it("should scan and delete all matching keys", async () => {
			MOCK_REDIS_INSTANCE.scan
				.mockResolvedValueOnce(["1", ["key1", "key2"]])
				.mockResolvedValueOnce(["0", ["key3"]]);
			MOCK_REDIS_INSTANCE.pipeline.mockReturnValue({
				del: jest.fn<() => any>(),
				exec: jest
					.fn<() => Promise<any>>()
					.mockResolvedValue([[null, 1] as any]),
			} as any);

			await cache.clear();

			expect(MOCK_REDIS_INSTANCE.scan).toHaveBeenCalledWith(
				"0",
				"MATCH",
				"discovery:cache:*",
				"COUNT",
				200
			);
		});

		it("should handle empty scan result", async () => {
			MOCK_REDIS_INSTANCE.scan.mockResolvedValue(["0", []]);
			await cache.clear();
			expect(MOCK_REDIS_INSTANCE.pipeline).not.toHaveBeenCalled();
		});
	});

	describe("circuit state", () => {
		it("should store circuit state with 2x TTL", async () => {
			MOCK_REDIS_INSTANCE.setex.mockResolvedValue(REDIS_RESP.OK);
			await cache.setCircuitState(toInstanceId("i-1"), {
				failures: PositiveInt.of(3),
				lastFailureTime: UnixTimestamp.of(1000),
				state: CircuitStateEnum.OPEN,
			});
			expect(MOCK_REDIS_INSTANCE.setex).toHaveBeenCalledWith(
				"discovery:cache:circuit:i-1",
				10,
				expect.any(String)
			);
		});

		it("should retrieve circuit state", async () => {
			const state = {
				failures: PositiveInt.of(3),
				lastFailureTime: UnixTimestamp.of(1000),
				state: CircuitStateEnum.OPEN,
			};
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(JSON.stringify(state));
			const result = await cache.getCircuitState(toInstanceId("i-1"));
			expect(result).toEqual(state);
		});

		it("should delete circuit state", async () => {
			MOCK_REDIS_INSTANCE.del.mockResolvedValue(1);
			await cache.deleteCircuitState(toInstanceId("i-1"));
			expect(MOCK_REDIS_INSTANCE.del).toHaveBeenCalledWith(
				"discovery:cache:circuit:i-1"
			);
		});
	});

	describe("entries", () => {
		it("should return empty array", async () => {
			const result = await cache.entries();
			expect(result).toEqual([]);
		});
	});

	describe("constructor", () => {
		it("should compute ttlSec as Math.max(1, ceil(ttlMs/1000))", () => {
			const c = new RedisServiceCache({
				redisUrl: "redis://localhost:6379",
				prefix: "p:",
				ttlMs: 1 as never,
			});
			expect((c as any)._storeOptions.ttlSec).toBe(1);

			const c2 = new RedisServiceCache({
				redisUrl: "redis://localhost:6379",
				prefix: "p:",
				ttlMs: 999 as never,
			});
			expect((c2 as any)._storeOptions.ttlSec).toBe(1);

			const c3 = new RedisServiceCache({
				redisUrl: "redis://localhost:6379",
				prefix: "p:",
				ttlMs: 1000 as never,
			});
			expect((c3 as any)._storeOptions.ttlSec).toBe(1);

			const c4 = new RedisServiceCache({
				redisUrl: "redis://localhost:6379",
				prefix: "p:",
				ttlMs: 1500 as never,
			});
			expect((c4 as any)._storeOptions.ttlSec).toBe(2);
		});
	});

	describe("getVersion", () => {
		it("should return version from stored data", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(
				JSON.stringify({ version: 42, instance: { serviceName: "svc" } })
			);
			const v = await cache.getVersion(toServiceId("svc"));
			expect(v).toBe(42);
		});

		it("should return 0 when key not found", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(null);
			const v = await cache.getVersion(toServiceId("svc"));
			expect(v).toBe(0);
		});

		it("should return 0 when version field missing", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(
				JSON.stringify({ instance: { serviceName: "svc" } })
			);
			const v = await cache.getVersion(toServiceId("svc"));
			expect(v).toBe(0);
		});

		it("should return 0 on Redis error", async () => {
			MOCK_REDIS_INSTANCE.get.mockRejectedValue(new Error("err"));
			const v = await cache.getVersion(toServiceId("svc"));
			expect(v).toBe(0);
		});
	});

	describe("get with version-parsed data", () => {
		it("should parse version-tagged entry", async () => {
			const instance = { serviceName: "svc", instanceId: toInstanceId("i-1") };
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(JSON.stringify(instance));
			const result = await cache.get(toServiceId("svc"));
			expect(result).toEqual(instance);
		});
	});

	describe("set error handling", () => {
		it("should handle set failure gracefully", async () => {
			MOCK_REDIS_INSTANCE.setex.mockRejectedValue(new Error("write error"));
			await expect(
				cache.set({
					serviceName: toServiceId("svc"),
					instance: { serviceName: "svc" } as any,
				})
			).resolves.toBeUndefined();
		});
	});

	describe("clear error handling", () => {
		it("should handle clear failure gracefully", async () => {
			MOCK_REDIS_INSTANCE.scan.mockRejectedValue(new Error("scan error"));
			await expect(cache.clear()).resolves.toBeUndefined();
		});
	});

	describe("entries with data", () => {
		it("should parse entries from scan results", async () => {
			MOCK_REDIS_INSTANCE.scan.mockResolvedValue([
				"0",
				["discovery:cache:svc"],
			]);
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(
				JSON.stringify({ serviceName: "svc", instanceId: toInstanceId("i-1") })
			);
			const result = await cache.entries();
			expect(result).toHaveLength(1);
			expect(result[0].serviceName).toBe("svc");
		});

		it("should skip null entries during scan", async () => {
			MOCK_REDIS_INSTANCE.scan.mockResolvedValue([
				"0",
				["discovery:cache:svc"],
			]);
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(null);
			const result = await cache.entries();
			expect(result).toEqual([]);
		});

		it("should handle entries error gracefully", async () => {
			MOCK_REDIS_INSTANCE.scan.mockRejectedValue(new Error("entries error"));
			const result = await cache.entries();
			expect(result).toEqual([]);
		});
	});

	describe("circuit state error handling", () => {
		it("should handle setCircuitState failure gracefully", async () => {
			MOCK_REDIS_INSTANCE.setex.mockRejectedValue(new Error("err"));
			await expect(
				cache.setCircuitState(toInstanceId("i-1"), {
					failures: PositiveInt.of(1),
					lastFailureTime: UnixTimestamp.of(0),
					state: CircuitStateEnum.OPEN,
				})
			).resolves.toBeUndefined();
		});

		it("should return null when getCircuitState key not found", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(null);
			const result = await cache.getCircuitState(toInstanceId("i-2"));
			expect(result).toBeNull();
		});

		it("should handle getCircuitState error gracefully", async () => {
			MOCK_REDIS_INSTANCE.get.mockRejectedValue(new Error("err"));
			const result = await cache.getCircuitState(toInstanceId("i-1"));
			expect(result).toBeNull();
		});

		it("should handle deleteCircuitState failure gracefully", async () => {
			MOCK_REDIS_INSTANCE.del.mockRejectedValue(new Error("err"));
			await expect(
				cache.deleteCircuitState(toInstanceId("i-1"))
			).resolves.toBeUndefined();
		});
	});

	describe("stop", () => {
		it("should disconnect", async () => {
			await cache.get(toServiceId("svc"));
			cache.stop();
			expect(MOCK_REDIS_INSTANCE.quit).toHaveBeenCalled();
		});
	});
});
