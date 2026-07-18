import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ServiceInstance } from "@trading-model/validation/contracts/service-registry.types";

jest.mock("@trading-model/common/utils/lru-cache");

import type { CacheConfig } from "@trading-model/common/utils/cache-config";
import { LruCache } from "@trading-model/common/utils/lru-cache";
import { CacheManager } from "../../src/core/cache-manager";

function makeInstance(id: string): ServiceInstance {
	return {
		serviceName: "financial-scraper-service",
		instanceId: id,
		host: "127.0.0.1",
		port: 8080,
		protocol: "http",
		version: "1.0.0",
		ttl: 30000,
		registeredAt: Date.now(),
		lastHeartbeat: Date.now(),
	};
}

const MockLruCache = LruCache as unknown as jest.Mock;

describe("CacheManager", () => {
	let cacheManager: CacheManager;
	let config: CacheConfig;

	beforeEach(() => {
		jest.clearAllMocks();
		config = { maxSize: 100 };
		cacheManager = new CacheManager(config);
	});

	describe("constructor", () => {
		it("should create two LruCache instances", () => {
			expect(LruCache).toHaveBeenCalledTimes(2);
			expect(LruCache).toHaveBeenCalledWith(config);
			expect(LruCache).toHaveBeenCalledWith({ maxSize: 100 });
		});
	});

	describe("get", () => {
		it("should delegate to cache.get", () => {
			const instances = [makeInstance("i-1")];
			const mockCacheGet = (
				MockLruCache.mock.instances[0] as LruCache<ServiceInstance[]>
			).get as jest.Mock;
			mockCacheGet.mockReturnValue(instances);

			const result = cacheManager.cache.get("financial-scraper-service");
			expect(result).toBe(instances);
			expect(mockCacheGet).toHaveBeenCalledWith("financial-scraper-service");
		});

		it("should return undefined when cache miss", () => {
			const mockCacheGet = (
				MockLruCache.mock.instances[0] as LruCache<ServiceInstance[]>
			).get as jest.Mock;
			mockCacheGet.mockReturnValue(undefined);

			const result = cacheManager.cache.get("unknown-service");
			expect(result).toBeUndefined();
		});
	});

	describe("set", () => {
		it("should store in both caches", () => {
			const instances = [makeInstance("i-1")];
			const mockCache1Set = (
				MockLruCache.mock.instances[0] as LruCache<ServiceInstance[]>
			).set as jest.Mock;
			const mockCache2Set = (
				MockLruCache.mock.instances[1] as LruCache<ServiceInstance[]>
			).set as jest.Mock;

			cacheManager.set("financial-scraper-service", instances, 5000);
			expect(mockCache1Set).toHaveBeenCalledWith(
				"financial-scraper-service",
				instances,
				5000
			);
			expect(mockCache2Set).toHaveBeenCalledWith(
				"financial-scraper-service",
				instances
			);
		});

		it("should store without ttlMs", () => {
			const instances = [makeInstance("i-1")];
			const mockCache1Set = (
				MockLruCache.mock.instances[0] as LruCache<ServiceInstance[]>
			).set as jest.Mock;

			cacheManager.set("financial-scraper-service", instances);
			expect(mockCache1Set).toHaveBeenCalledWith(
				"financial-scraper-service",
				instances,
				undefined
			);
		});
	});

	describe("getStale", () => {
		it("should return from staleData.get", () => {
			const instances = [makeInstance("i-1")];
			const mockStaleGet = (
				MockLruCache.mock.instances[1] as LruCache<ServiceInstance[]>
			).get as jest.Mock;
			mockStaleGet.mockReturnValue(instances);

			const result = cacheManager.staleData.get("financial-scraper-service");
			expect(result).toBe(instances);
		});
	});

	describe("delete", () => {
		it("should delete from both caches", () => {
			const mockCache1Del = (
				MockLruCache.mock.instances[0] as LruCache<ServiceInstance[]>
			).delete as jest.Mock;
			const mockCache2Del = (
				MockLruCache.mock.instances[1] as LruCache<ServiceInstance[]>
			).delete as jest.Mock;

			cacheManager.delete("financial-scraper-service");
			expect(mockCache1Del).toHaveBeenCalledWith("financial-scraper-service");
			expect(mockCache2Del).toHaveBeenCalledWith("financial-scraper-service");
		});
	});

	describe("invalidate", () => {
		it("should call delete with the service name", () => {
			const deleteSpy = jest.spyOn(cacheManager, "delete");
			cacheManager.invalidate("financial-scraper-service");
			expect(deleteSpy).toHaveBeenCalledWith("financial-scraper-service");
		});
	});

	describe("has", () => {
		it("should delegate to cache.has", () => {
			const mockCacheHas = (
				MockLruCache.mock.instances[0] as LruCache<ServiceInstance[]>
			).has as jest.Mock;
			mockCacheHas.mockReturnValue(true);

			const result = cacheManager.cache.has("financial-scraper-service");
			expect(result).toBe(true);
			expect(mockCacheHas).toHaveBeenCalledWith("financial-scraper-service");
		});

		it("should return false when key is missing", () => {
			const mockCacheHas = (
				MockLruCache.mock.instances[0] as LruCache<ServiceInstance[]>
			).has as jest.Mock;
			mockCacheHas.mockReturnValue(false);

			const result = cacheManager.cache.has("unknown-service");
			expect(result).toBe(false);
		});
	});

	describe("size", () => {
		it("should return the size from cache", () => {
			Object.defineProperty(
				MockLruCache.mock.instances[0] as LruCache<ServiceInstance[]>,
				"size",
				{ get: () => 5 }
			);

			expect(cacheManager.cache.size).toBe(5);
		});
	});

	describe("clear", () => {
		it("should clear both caches", () => {
			const mockCache1Clear = (
				MockLruCache.mock.instances[0] as LruCache<ServiceInstance[]>
			).clear as jest.Mock;
			const mockCache2Clear = (
				MockLruCache.mock.instances[1] as LruCache<ServiceInstance[]>
			).clear as jest.Mock;

			cacheManager.clear();
			expect(mockCache1Clear).toHaveBeenCalled();
			expect(mockCache2Clear).toHaveBeenCalled();
		});
	});
});
