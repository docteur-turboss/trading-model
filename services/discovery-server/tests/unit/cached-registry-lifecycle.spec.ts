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
import {
	CachedRegistryLifecycle,
	type CachedRegistryLifecycleDeps,
} from "../../src/application/cached-registry-lifecycle";
import type { BackendPingManager } from "../../src/infrastructure/backend-ping-manager";
import type { CacheManager } from "../../src/infrastructure/cache-manager";
import type { PubSubInvalidator } from "../../src/infrastructure/pub-sub-invalidator";
import type { RedisHealthMonitor } from "../../src/infrastructure/redis-health-monitor";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

function createMockDeps(): jest.Mocked<CachedRegistryLifecycleDeps> {
	return {
		healthMonitor: {
			start: jest.fn(),
			stop: jest.fn(),
			stopBackend: jest.fn(),
			markUnhealthy: jest.fn(),
			setFallbackBackend: jest.fn(),
			fallbackActive: false,
			isHealthy: true,
			consecutiveFailures: 0,
		} as unknown as jest.Mocked<RedisHealthMonitor>,
		pingManager: {
			pingPubSub: jest.fn(),
			pingBackend: jest.fn().mockResolvedValue(true),
			isRedisBackend: jest.fn(),
		} as unknown as jest.Mocked<BackendPingManager>,
		pubSub: {
			start: jest.fn(),
			stop: jest.fn(),
			publish: jest.fn(),
			client: { status: "close" },
		} as unknown as jest.Mocked<PubSubInvalidator>,
		cache: {
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
		} as unknown as jest.Mocked<CacheManager>,
		backend: {
			start: jest.fn(),
			stop: jest.fn(),
		} as unknown as jest.Mocked<RegistryBackend>,
	} as jest.Mocked<CachedRegistryLifecycleDeps>;
}

describe("CachedRegistryLifecycle", () => {
	let deps: jest.Mocked<CachedRegistryLifecycleDeps>;
	let lifecycle: CachedRegistryLifecycle;

	beforeEach(() => {
		jest.useFakeTimers();
		deps = createMockDeps();
		lifecycle = new CachedRegistryLifecycle(deps);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("start", () => {
		it("should start backend, pubsub, and health monitor", async () => {
			await lifecycle.start();

			expect(deps.backend.start).toHaveBeenCalled();
			expect(deps.pubSub.start).toHaveBeenCalledWith(deps.cache);
			expect(deps.healthMonitor.start).toHaveBeenCalled();
		});
	});

	describe("ping", () => {
		it("should return false when fallback is active", async () => {
			deps.healthMonitor.fallbackActive = true;

			const result = await lifecycle.ping();

			expect(result).toBe(false);
			expect(deps.pingManager.pingPubSub).not.toHaveBeenCalled();
			expect(deps.pingManager.pingBackend).not.toHaveBeenCalled();
		});

		it("should ping pubsub and backend when fallback is not active", async () => {
			deps.healthMonitor.fallbackActive = false;
			deps.pingManager.pingPubSub.mockResolvedValue(undefined);
			deps.pingManager.pingBackend.mockResolvedValue(true);

			const result = await lifecycle.ping();

			expect(deps.pingManager.pingPubSub).toHaveBeenCalled();
			expect(deps.pingManager.pingBackend).toHaveBeenCalled();
			expect(result).toBe(true);
		});

		it("should return the backend ping result", async () => {
			deps.pingManager.pingBackend.mockResolvedValue(false);

			const result = await lifecycle.ping();

			expect(result).toBe(false);
		});
	});

	describe("markUnhealthy", () => {
		it("should delegate to health monitor", () => {
			lifecycle.markUnhealthy();

			expect(deps.healthMonitor.markUnhealthy).toHaveBeenCalled();
		});
	});

	describe("setFallbackBackend", () => {
		it("should set fallback backend and clear cache", () => {
			const fallback = {} as RegistryBackend;

			lifecycle.setFallbackBackend(fallback);

			expect(deps.healthMonitor.setFallbackBackend).toHaveBeenCalledWith(
				fallback
			);
			expect(deps.cache.clear).toHaveBeenCalled();
		});
	});

	describe("stop", () => {
		it("should stop health monitor, clear cache, stop pubsub, and stop backend", () => {
			lifecycle.stop();

			expect(deps.healthMonitor.stop).toHaveBeenCalled();
			expect(deps.cache.clear).toHaveBeenCalled();
			expect(deps.pubSub.stop).toHaveBeenCalled();
			expect(deps.healthMonitor.stopBackend).toHaveBeenCalled();
		});
	});
});
