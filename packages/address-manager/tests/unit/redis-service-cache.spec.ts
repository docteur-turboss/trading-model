import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_REDIS_INSTANCE: Record<
	string,
	jest.Mock<(...args: any[]) => any>
> = {
	connect: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(),
	disconnect: jest.fn<(...args: any[]) => void>(),
	get: jest
		.fn<(...args: any[]) => Promise<string | null>>()
		.mockResolvedValue(null),
	setex: jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue("OK"),
	del: jest.fn<(...args: any[]) => Promise<number>>().mockResolvedValue(1),
	scan: jest
		.fn<(...args: any[]) => Promise<[string, string[]]>>()
		.mockResolvedValue(["0", []]),
	pipeline: jest.fn<(...args: any[]) => any>(),
	set: jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue("OK"),
};

jest.mock("ioredis", () => {
	return jest.fn(() => MOCK_REDIS_INSTANCE);
});

import { RedisServiceCache } from "../../src/discovery/redis-service-cache";

describe("RedisServiceCache", () => {
	let cache: RedisServiceCache;

	beforeEach(() => {
		jest.clearAllMocks();
		cache = new RedisServiceCache(
			"redis://localhost:6379",
			"discovery:cache:",
			5000
		);
	});

	describe("set / get", () => {
		it("should store instance with TTL in seconds", async () => {
			MOCK_REDIS_INSTANCE.setex.mockResolvedValue("OK");
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(
				JSON.stringify({
					serviceName: "svc",
					instanceId: "i-1",
					ip: "127.0.0.1",
					port: 8080,
				})
			);

			await cache.set("svc", {
				serviceName: "svc",
				instanceId: "i-1",
				ip: "127.0.0.1",
				port: 8080,
			} as any);
			const result = await cache.get("svc");

			expect(MOCK_REDIS_INSTANCE.setex).toHaveBeenCalledWith(
				"discovery:cache:svc",
				5,
				expect.any(String)
			);
			expect(result).not.toBeNull();
		});

		it("should return null when key not found", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(null);
			const result = await cache.get("nonexistent");
			expect(result).toBeNull();
		});

		it("should use region-prefixed keys when region provided", async () => {
			MOCK_REDIS_INSTANCE.setex.mockResolvedValue("OK");
			await cache.set("svc", { serviceName: "svc" } as any, "us-east");
			expect(MOCK_REDIS_INSTANCE.setex).toHaveBeenCalledWith(
				"discovery:cache:svc::us-east",
				expect.any(Number),
				expect.any(String)
			);
		});

		it("should return null on Redis error", async () => {
			MOCK_REDIS_INSTANCE.get.mockRejectedValue(new Error("Connection lost"));
			const result = await cache.get("svc");
			expect(result).toBeNull();
		});
	});

	describe("invalidate", () => {
		it("should delete key from Redis", async () => {
			MOCK_REDIS_INSTANCE.del.mockResolvedValue(1);
			await cache.invalidate("svc");
			expect(MOCK_REDIS_INSTANCE.del).toHaveBeenCalledWith(
				"discovery:cache:svc"
			);
		});

		it("should handle errors gracefully", async () => {
			MOCK_REDIS_INSTANCE.del.mockRejectedValue(new Error("error"));
			await expect(cache.invalidate("svc")).resolves.toBeUndefined();
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
			MOCK_REDIS_INSTANCE.setex.mockResolvedValue("OK");
			await cache.setCircuitState("i-1", {
				failures: 3,
				lastFailureTime: 1000,
				state: "open",
			});
			expect(MOCK_REDIS_INSTANCE.setex).toHaveBeenCalledWith(
				"discovery:cache:circuit:i-1",
				10,
				expect.any(String)
			);
		});

		it("should retrieve circuit state", async () => {
			const state = {
				failures: 3,
				lastFailureTime: 1000,
				state: "open" as const,
			};
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(JSON.stringify(state));
			const result = await cache.getCircuitState("i-1");
			expect(result).toEqual(state);
		});

		it("should delete circuit state", async () => {
			MOCK_REDIS_INSTANCE.del.mockResolvedValue(1);
			await cache.deleteCircuitState("i-1");
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
			const c = new RedisServiceCache("redis://localhost:6379", "p:", 1);
			expect((c as any)._ttlSec).toBe(1);

			const c2 = new RedisServiceCache("redis://localhost:6379", "p:", 999);
			expect((c2 as any)._ttlSec).toBe(1);

			const c3 = new RedisServiceCache("redis://localhost:6379", "p:", 1000);
			expect((c3 as any)._ttlSec).toBe(1);

			const c4 = new RedisServiceCache("redis://localhost:6379", "p:", 1500);
			expect((c4 as any)._ttlSec).toBe(2);
		});
	});

	describe("getVersion", () => {
		it("should return version from stored data", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(
				JSON.stringify({ version: 42, instance: { serviceName: "svc" } })
			);
			const v = await cache.getVersion("svc");
			expect(v).toBe(42);
		});

		it("should return 0 when key not found", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(null);
			const v = await cache.getVersion("svc");
			expect(v).toBe(0);
		});

		it("should return 0 when version field missing", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(
				JSON.stringify({ instance: { serviceName: "svc" } })
			);
			const v = await cache.getVersion("svc");
			expect(v).toBe(0);
		});

		it("should return 0 on Redis error", async () => {
			MOCK_REDIS_INSTANCE.get.mockRejectedValue(new Error("err"));
			const v = await cache.getVersion("svc");
			expect(v).toBe(0);
		});
	});

	describe("get with version-parsed data", () => {
		it("should parse version-tagged entry", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(
				JSON.stringify({
					version: 1,
					instance: { serviceName: "svc", instanceId: "i-1" },
				})
			);
			const result = await cache.get("svc");
			expect(result).toEqual({ serviceName: "svc", instanceId: "i-1" });
		});
	});

	describe("set error handling", () => {
		it("should handle set failure gracefully", async () => {
			MOCK_REDIS_INSTANCE.setex.mockRejectedValue(new Error("write error"));
			await expect(
				cache.set("svc", { serviceName: "svc" } as any)
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
				JSON.stringify({ serviceName: "svc", instanceId: "i-1" })
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
				cache.setCircuitState("i-1", {
					failures: 1,
					lastFailureTime: 0,
					state: "open",
				})
			).resolves.toBeUndefined();
		});

		it("should return null when getCircuitState key not found", async () => {
			MOCK_REDIS_INSTANCE.get.mockResolvedValue(null);
			const result = await cache.getCircuitState("i-2");
			expect(result).toBeNull();
		});

		it("should handle getCircuitState error gracefully", async () => {
			MOCK_REDIS_INSTANCE.get.mockRejectedValue(new Error("err"));
			const result = await cache.getCircuitState("i-1");
			expect(result).toBeNull();
		});

		it("should handle deleteCircuitState failure gracefully", async () => {
			MOCK_REDIS_INSTANCE.del.mockRejectedValue(new Error("err"));
			await expect(cache.deleteCircuitState("i-1")).resolves.toBeUndefined();
		});
	});

	describe("stop", () => {
		it("should disconnect", () => {
			cache.stop();
			expect(MOCK_REDIS_INSTANCE.disconnect).toHaveBeenCalled();
		});
	});
});
