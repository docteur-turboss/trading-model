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
} from "@trading-model/validation/adapters/outbound/service-registry.types";
import { CacheOrchestrator } from "../../src/application/cache-orchestrator";
import type { CacheManager } from "../../src/infrastructure/cache-manager";
import type { RedisHealthMonitor } from "../../src/infrastructure/redis-health-monitor";

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

const A_SERVICE = "financial-scraper-service";
const MAKE_INSTANCE = (id: string): ServiceInstance => ({
	serviceName: A_SERVICE,
	instanceId: id,
	host: "127.0.0.1",
	port: 8080,
	protocol: "http",
	lastHeartbeat: Date.now(),
	registeredAt: Date.now(),
	version: "1.0.0",
	ttl: 30000,
});

describe("CacheOrchestrator", () => {
	let mockBackend: jest.Mocked<RegistryBackend>;
	let mockCache: jest.Mocked<CacheManager>;
	let mockHealthMonitor: jest.Mocked<RedisHealthMonitor>;
	let orchestrator: CacheOrchestrator;

	beforeEach(() => {
		jest.useFakeTimers();
		mockBackend = createMockBackend();
		mockCache = createMockCache();
		mockHealthMonitor = createMockHealthMonitor();
		orchestrator = new CacheOrchestrator(
			mockBackend,
			mockCache,
			mockHealthMonitor
		);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("getInstances", () => {
		it("should delegate to internal fetcher", async () => {
			const instances = [MAKE_INSTANCE("i-1")];
			mockBackend.getInstances.mockResolvedValue(instances);

			const result = await orchestrator.fetcher.getInstances(A_SERVICE);

			expect(result).toEqual(instances);
		});

		it("should pass pagination to fetcher", async () => {
			mockBackend.getInstances.mockResolvedValue([]);

			await orchestrator.fetcher.getInstances(A_SERVICE, { page: 1, limit: 5 });

			expect(mockBackend.getInstances).toHaveBeenCalledWith(A_SERVICE);
		});
	});

	describe("getInstance", () => {
		it("should delegate to internal fetcher and return instance from cache", async () => {
			const instance = MAKE_INSTANCE("i-1");
			mockCache.cache.get.mockReturnValue([instance]);

			const result = await orchestrator.fetcher.getInstance({
				serviceName: A_SERVICE,
				instanceId: "i-1",
			});

			expect(result).toEqual(instance);
		});

		it("should delegate to internal fetcher and fall through to backend on cache miss", async () => {
			const instance = MAKE_INSTANCE("i-1");
			mockCache.cache.get.mockReturnValue(undefined);
			mockBackend.getInstance.mockResolvedValue(instance);

			const result = await orchestrator.fetcher.getInstance({
				serviceName: A_SERVICE,
				instanceId: "i-1",
			});

			expect(mockBackend.getInstance).toHaveBeenCalled();
			expect(result).toEqual(instance);
		});
	});

	describe("refreshCache", () => {
		it("should refresh from backend when healthy", async () => {
			const instances = [MAKE_INSTANCE("i-1")];
			mockBackend.getInstances.mockResolvedValue(instances);

			await orchestrator.refreshCache(A_SERVICE);

			expect(mockBackend.getInstances).toHaveBeenCalledWith(A_SERVICE);
			expect(mockCache.set).toHaveBeenCalledWith(A_SERVICE, instances);
		});

		it("should skip refresh when backend is unhealthy and fallback is inactive", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			mockHealthMonitor.isHealthy = false;
			mockHealthMonitor.fallbackActive = false;

			await orchestrator.refreshCache(A_SERVICE);

			expect(mockBackend.getInstances).not.toHaveBeenCalled();
			expect(logger.warn).toHaveBeenCalledWith(
				"Backend unhealthy — skipping cache refresh, serving stale data",
				expect.any(Object)
			);
		});

		it("should refresh from backend when fallback is active", async () => {
			mockHealthMonitor.isHealthy = false;
			mockHealthMonitor.fallbackActive = true;
			const instances = [MAKE_INSTANCE("i-1")];
			mockBackend.getInstances.mockResolvedValue(instances);

			await orchestrator.refreshCache(A_SERVICE);

			expect(mockBackend.getInstances).toHaveBeenCalledWith(A_SERVICE);
			expect(mockCache.set).toHaveBeenCalledWith(A_SERVICE, instances);
		});

		it("should log warning and serve stale data when backend throws", async () => {
			const { logger } = require("@trading-model/common/config/logger");
			mockBackend.getInstances.mockRejectedValue(new Error("Redis down"));

			await orchestrator.refreshCache(A_SERVICE);

			expect(logger.warn).toHaveBeenCalledWith(
				"Cache refresh failed, serving stale data",
				expect.any(Object)
			);
			expect(mockCache.set).not.toHaveBeenCalled();
		});
	});

	describe("onHeartbeatUpdate", () => {
		it("should delegate to throttle manager", async () => {
			const publish = jest.fn();

			await orchestrator.onHeartbeatUpdate(A_SERVICE, publish);

			expect(publish).toHaveBeenCalledWith(A_SERVICE);
		});

		it("should throttle repeated calls within the window", async () => {
			const publish = jest.fn();
			await orchestrator.onHeartbeatUpdate(A_SERVICE, publish);
			await orchestrator.onHeartbeatUpdate(A_SERVICE, publish);

			expect(publish).toHaveBeenCalledTimes(1);
		});

		it("should allow publish after throttle window expires", async () => {
			const publish = jest.fn();
			await orchestrator.onHeartbeatUpdate(A_SERVICE, publish);

			jest.advanceTimersByTime(5001);
			await orchestrator.onHeartbeatUpdate(A_SERVICE, publish);

			expect(publish).toHaveBeenCalledTimes(2);
		});
	});
});
