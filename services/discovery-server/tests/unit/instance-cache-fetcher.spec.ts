import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { LruCache } from "@trading-model/common/utils/lru-cache";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/validation/contracts/service-registry.types";
import type { CacheManager } from "../../src/core/cache-manager";
import { InstanceCacheFetcher } from "../../src/core/instance-cache-fetcher";
import type { RedisHealthMonitor } from "../../src/core/redis-health-monitor";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

function createMockBackend(): jest.Mocked<RegistryBackend> {
	return {
		registerInstance: jest.fn(),
		updateHeartbeat: jest.fn(),
		updateToken: jest.fn(),
		getInstances: jest.fn(),
		getInstance: jest.fn(),
		removeInstance: jest.fn(),
		listServiceNames: jest.fn(),
		dump: jest.fn(),
		validInstanceToken: jest.fn(),
		generateInstanceToken: jest.fn(),
		verifyInstanceName: jest.fn(),
		generateInstanceId: jest.fn(),
		start: jest.fn(),
		stop: jest.fn(),
	} as jest.Mocked<RegistryBackend>;
}

function createMockCache(): jest.Mocked<CacheManager> {
	return {
		cache: {
			get: jest.fn(),
			set: jest.fn(),
			has: jest.fn(),
			delete: jest.fn(),
			clear: jest.fn(),
			size: 0,
		} as unknown as jest.Mocked<LruCache<ServiceInstance[]>>,
		staleData: {
			get: jest.fn(),
			set: jest.fn(),
			has: jest.fn(),
			delete: jest.fn(),
			clear: jest.fn(),
			size: 0,
		} as unknown as jest.Mocked<LruCache<ServiceInstance[]>>,
		set: jest.fn(),
		delete: jest.fn(),
		invalidate: jest.fn(),
		clear: jest.fn(),
	} as unknown as jest.Mocked<CacheManager>;
}

function createMockHealthMonitor(
	overrides?: Partial<jest.Mocked<RedisHealthMonitor>>
): jest.Mocked<RedisHealthMonitor> {
	return {
		isHealthy: true,
		fallbackActive: false,
		consecutiveFailures: 0,
		start: jest.fn(),
		stop: jest.fn(),
		stopBackend: jest.fn(),
		markUnhealthy: jest.fn(),
		setFallbackBackend: jest.fn(),
		...overrides,
	} as unknown as jest.Mocked<RedisHealthMonitor>;
}

const A_SERVICE = "financial-scraper-service" as any;
const MAKE_INSTANCE = (id: string): ServiceInstance => ({
	serviceName: "financial-scraper-service",
	instanceId: id,
	host: "127.0.0.1",
	port: 8080,
	protocol: "http",
	lastHeartbeat: Date.now(),
	registeredAt: Date.now(),
	version: "1.0.0",
	ttl: 30000,
});

describe("InstanceCacheFetcher", () => {
	let mockBackend: jest.Mocked<RegistryBackend>;
	let mockCache: jest.Mocked<CacheManager>;
	let mockHealthMonitor: jest.Mocked<RedisHealthMonitor>;
	let fetcher: InstanceCacheFetcher;

	beforeEach(() => {
		jest.useFakeTimers();
		mockBackend = createMockBackend();
		mockCache = createMockCache();
		mockHealthMonitor = createMockHealthMonitor();
		fetcher = new InstanceCacheFetcher(
			mockBackend,
			mockCache,
			mockHealthMonitor
		);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("getInstances", () => {
		it("should fetch with pagination when limit is provided", async () => {
			const allInstances = [
				MAKE_INSTANCE("i-1"),
				MAKE_INSTANCE("i-2"),
				MAKE_INSTANCE("i-3"),
			];
			mockBackend.getInstances.mockResolvedValue(allInstances);

			const result = await fetcher.getInstances(A_SERVICE, {
				page: 1,
				limit: 2,
			});

			expect(mockBackend.getInstances).toHaveBeenCalledWith(A_SERVICE);
			expect(result).toHaveLength(2);
		});

		it("should fetch with pagination when page is provided", async () => {
			const allInstances = [
				MAKE_INSTANCE("i-1"),
				MAKE_INSTANCE("i-2"),
				MAKE_INSTANCE("i-3"),
			];
			mockBackend.getInstances.mockResolvedValue(allInstances);

			const result = await fetcher.getInstances(A_SERVICE, {
				page: 0,
				limit: 2,
			});

			expect(result).toHaveLength(2);
			expect(result[0].instanceId).toBe("i-1");
		});

		it("should fetch from backend directly when fallback is active", async () => {
			mockHealthMonitor.fallbackActive = true;
			const instances = [MAKE_INSTANCE("i-1")];
			mockBackend.getInstances.mockResolvedValue(instances);

			const result = await fetcher.getInstances(A_SERVICE);

			expect(mockBackend.getInstances).toHaveBeenCalledWith(A_SERVICE);
			expect(result).toEqual(instances);
			expect(mockCache.cache.get).not.toHaveBeenCalled();
		});

		it("should return cached data on cache hit", async () => {
			const instances = [MAKE_INSTANCE("i-1")];
			mockCache.cache.get.mockReturnValue(instances);

			const result = await fetcher.getInstances(A_SERVICE);

			expect(mockCache.cache.get).toHaveBeenCalledWith(A_SERVICE);
			expect(result).toEqual(instances);
			expect(mockBackend.getInstances).not.toHaveBeenCalled();
		});

		it("should serve stale data when backend is unhealthy and stale exists", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			mockHealthMonitor.isHealthy = false;
			mockCache.cache.get.mockReturnValue(undefined);
			const staleInstances = [MAKE_INSTANCE("i-1")];
			mockCache.staleData.get.mockReturnValue(staleInstances);

			const result = await fetcher.getInstances(A_SERVICE);

			expect(mockCache.staleData.get).toHaveBeenCalledWith(A_SERVICE);
			expect(result).toEqual(staleInstances);
			expect(logger.warn).toHaveBeenCalledWith(
				"Backend unhealthy — serving stale cached instance list for",
				expect.any(Object)
			);
		});

		it("should return empty list when unhealthy and no stale data", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			mockHealthMonitor.isHealthy = false;
			mockCache.cache.get.mockReturnValue(undefined);
			mockCache.staleData.get.mockReturnValue(undefined);

			const result = await fetcher.getInstances(A_SERVICE);

			expect(result).toEqual([]);
			expect(logger.warn).toHaveBeenCalledWith(
				"Backend unhealthy — no stale data available, returning empty list for",
				expect.any(Object)
			);
		});

		it("should fetch from backend and cache on cache miss when healthy", async () => {
			const instances = [MAKE_INSTANCE("i-1")];
			mockHealthMonitor.isHealthy = true;
			mockCache.cache.get.mockReturnValue(undefined);
			mockBackend.getInstances.mockResolvedValue(instances);

			const result = await fetcher.getInstances(A_SERVICE);

			expect(mockBackend.getInstances).toHaveBeenCalledWith(A_SERVICE);
			expect(mockCache.set).toHaveBeenCalledWith(A_SERVICE, instances);
			expect(result).toEqual(instances);
		});
	});

	describe("getInstance", () => {
		it("should fetch from backend directly when fallback is active", async () => {
			mockHealthMonitor.fallbackActive = true;
			const instance = MAKE_INSTANCE("i-1");
			mockBackend.getInstance.mockResolvedValue(instance);

			const result = await fetcher.getInstance({
				serviceName: A_SERVICE,
				instanceId: "i-1",
			});

			expect(mockBackend.getInstance).toHaveBeenCalledWith({
				serviceName: A_SERVICE,
				instanceId: "i-1",
			});
			expect(result).toEqual(instance);
		});

		it("should return instance from cached list when available", async () => {
			const instances = [MAKE_INSTANCE("i-1"), MAKE_INSTANCE("i-2")];
			mockCache.cache.get.mockReturnValue(instances);

			const result = await fetcher.getInstance({
				serviceName: A_SERVICE,
				instanceId: "i-2",
			});

			expect(mockBackend.getInstance).not.toHaveBeenCalled();
			expect(result?.instanceId).toBe("i-2");
		});

		it("should return stale instance when unhealthy and stale data exists", async () => {
			const staleInstances = [MAKE_INSTANCE("i-1")];
			mockHealthMonitor.isHealthy = false;
			mockCache.cache.get.mockReturnValue(undefined);
			mockCache.staleData.get.mockReturnValue(staleInstances);

			const result = await fetcher.getInstance({
				serviceName: A_SERVICE,
				instanceId: "i-1",
			});

			expect(mockCache.staleData.get).toHaveBeenCalledWith(A_SERVICE);
			expect(result).toEqual(staleInstances[0]);
		});

		it("should fall through to backend when cache miss and healthy", async () => {
			const instance = MAKE_INSTANCE("i-1");
			mockHealthMonitor.isHealthy = true;
			mockCache.cache.get.mockReturnValue(undefined);
			mockBackend.getInstance.mockResolvedValue(instance);

			const result = await fetcher.getInstance({
				serviceName: A_SERVICE,
				instanceId: "i-1",
			});

			expect(mockBackend.getInstance).toHaveBeenCalledWith({
				serviceName: A_SERVICE,
				instanceId: "i-1",
			});
			expect(result).toEqual(instance);
		});

		it("should fall through to backend when cache miss and unhealthy with no stale", async () => {
			const instance = MAKE_INSTANCE("i-1");
			mockHealthMonitor.isHealthy = false;
			mockCache.cache.get.mockReturnValue(undefined);
			mockCache.staleData.get.mockReturnValue(undefined);
			mockBackend.getInstance.mockResolvedValue(instance);

			const result = await fetcher.getInstance({
				serviceName: A_SERVICE,
				instanceId: "i-1",
			});

			expect(mockBackend.getInstance).toHaveBeenCalledWith({
				serviceName: A_SERVICE,
				instanceId: "i-1",
			});
			expect(result).toEqual(instance);
		});
	});
});
