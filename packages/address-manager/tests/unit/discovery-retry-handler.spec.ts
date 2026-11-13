import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { Protocol } from "@trading-model/contracts/service-registry-types";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import {
	DurationMs,
	FilePath,
	IPAddress,
	Port,
	toDurationMs,
	toInstanceId,
	toServiceId,
	toVersion,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { ServiceCache } from "../../src/adapters/outbound/discovery/service-cache";
import type { ServiceHealthChecker } from "../../src/adapters/outbound/discovery/service-health-checker";
import type { DiscoveryCircuitBreaker } from "../../src/application/discovery/circuit-breaker";
import { DiscoveryRetryHandler } from "../../src/application/discovery/discovery-retry-handler";
import type { ServiceInstance } from "../../src/domain/client/type";
import type { AddressManagerConfig } from "../../src/domain/config/address-manager-config";
import type { DiscoveryContext } from "../../src/domain/discovery/discovery-context";
import type { ServiceCachePort } from "../../src/domain/ports/service-cache.port";
import type { DiscoveryResult } from "../../src/infrastructure/metrics";

jest.mock("@trading-model/contracts/logger-registry", () => {
	const logger = {
		warn: jest.fn<(...args: any[]) => any>(),
		debug: jest.fn<(...args: any[]) => any>(),
	};
	return { getLogger: () => logger, logger };
});
jest.mock("@trading-model/common/utils/sleep", () => ({
	sleep: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
jest.mock("../../src/infrastructure/metrics", () => ({
	DiscoveryResult: {
		Success: "success",
		Failure: "failure",
		Degraded: "degraded",
	},
	recordDiscoveryMetrics: jest.fn<(...args: any[]) => any>(),
}));

import { sleep } from "@trading-model/common/utils/sleep";
import { getLogger } from "@trading-model/contracts/logger-registry";
import { recordDiscoveryMetrics } from "../../src/infrastructure/metrics";

describe("DiscoveryRetryHandler", () => {
	const FixedTimestamp = 1_700_000_000_000;
	const startTime = UnixTimestamp.now();
	const serviceId = toServiceId("user-service");
	const svcInstanceName = serviceId as unknown as ServiceInstanceName;
	const discoveryCtx: DiscoveryContext = {
		serviceName: svcInstanceName,
		startTime,
	};
	const instance: ServiceInstance = {
		host: IPAddress.of("127.0.0.1"),
		port: Port.of(8080),
		instanceId: toInstanceId("instance-1"),
		lastHeartbeat: UnixTimestamp.of(FixedTimestamp),
		protocol: Protocol.Http,
		registeredAt: UnixTimestamp.of(FixedTimestamp),
		serviceName: serviceId,
		version: toVersion("1.0.0"),
		ttl: toDurationMs(30000),
	};

	let handler: DiscoveryRetryHandler;
	let mockDiscovery: {
		findCachedService: jest.Mock<
			(name: ServiceInstanceName) => Promise<ServiceInstance>
		>;
	};
	let mockCache: jest.Mocked<ServiceCachePort>;
	let mockCircuitBreaker: jest.Mocked<DiscoveryCircuitBreaker>;

	function newHandler(
		serviceCache: ServiceCachePort,
		breaker: DiscoveryCircuitBreaker
	): DiscoveryRetryHandler {
		return new DiscoveryRetryHandler(
			{
				serviceCache,
				httpClient: {},
				config: { addressManagerUrl: "http://localhost" },
				healthChecker: {},
			} as never,
			breaker
		);
	}

	function createMockCache(): jest.Mocked<ServiceCachePort> {
		return {
			get: jest
				.fn<() => Promise<ServiceInstance | null>>()
				.mockResolvedValue(null),
			getStale: jest
				.fn<() => Promise<ServiceInstance | null>>()
				.mockResolvedValue(null),
			set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			delete: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			clear: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			entries: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
			setCircuitState: jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined),
			getCircuitState: jest
				.fn<() => Promise<unknown>>()
				.mockResolvedValue(null),
			deleteCircuitState: jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined),
			close: jest.fn<(...args: any[]) => any>(),
		} as unknown as jest.Mocked<ServiceCachePort>;
	}

	function createMockCircuitBreaker(): jest.Mocked<DiscoveryCircuitBreaker> {
		return {
			isOpen: jest.fn<() => boolean>().mockReturnValue(false),
			check: jest.fn<(...args: any[]) => any>(),
			isAllowed: jest.fn<(...args: any[]) => any>(),
			recordFailure: jest.fn<(...args: any[]) => any>(),
			recordSuccess: jest.fn<(...args: any[]) => any>(),
			recordLatency: jest.fn<(...args: any[]) => any>(),
			getState: jest.fn<(...args: any[]) => any>(),
			getFailureCount: jest.fn<(...args: any[]) => any>(),
			getStateSummary: jest.fn<(...args: any[]) => any>(),
			call: jest.fn<(...args: any[]) => any>(),
			clear: jest.fn<(...args: any[]) => any>(),
		} as unknown as jest.Mocked<DiscoveryCircuitBreaker>;
	}

	beforeEach(() => {
		jest.clearAllMocks();

		mockCache = createMockCache();
		mockCircuitBreaker = createMockCircuitBreaker();

		handler = newHandler(mockCache, mockCircuitBreaker);
		mockDiscovery = {
			findCachedService: jest.spyOn(handler, "findCachedService"),
		} as typeof mockDiscovery;
	});

	describe("attemptDiscovery", () => {
		test("returns instance on first attempt when circuit breaker is closed (success path)", async () => {
			mockDiscovery.findCachedService.mockResolvedValue(instance);
			mockCircuitBreaker.isOpen.mockReturnValue(false);

			const result = await handler.attemptDiscovery(discoveryCtx);

			expect(result).toBe(instance);
			expect(mockCircuitBreaker.isOpen).toHaveBeenCalledWith(
				instance.instanceId
			);
			expect(recordDiscoveryMetrics).toHaveBeenCalledWith(
				{ serviceName: serviceId, startTime },
				"success" as DiscoveryResult
			);
			expect(mockCache.delete).not.toHaveBeenCalled();
			expect(sleep).not.toHaveBeenCalled();
		});

		test("retries when circuit breaker is open and succeeds on subsequent attempt", async () => {
			mockDiscovery.findCachedService.mockResolvedValue(instance);
			mockCircuitBreaker.isOpen
				.mockReturnValueOnce(true)
				.mockReturnValueOnce(false);

			const result = await handler.attemptDiscovery(discoveryCtx);

			expect(result).toBe(instance);
			expect(mockCircuitBreaker.isOpen).toHaveBeenCalledTimes(2);
			expect(mockCache.delete).toHaveBeenCalledTimes(1);
			expect(mockCache.delete).toHaveBeenCalledWith(serviceId);
			expect(sleep).toHaveBeenCalledTimes(1);
			expect(sleep).toHaveBeenCalledWith(100);
			expect(recordDiscoveryMetrics).toHaveBeenCalledWith(
				{ serviceName: serviceId, startTime },
				"success" as DiscoveryResult
			);
		});

		test("throws Discovery failed error when all retries exhausted with circuit breaker open", async () => {
			mockDiscovery.findCachedService.mockResolvedValue(instance);
			mockCircuitBreaker.isOpen.mockReturnValue(true);

			await expect(handler.attemptDiscovery(discoveryCtx)).rejects.toThrow(
				"Discovery failed"
			);

			expect(mockCircuitBreaker.isOpen).toHaveBeenCalledTimes(3);
			expect(mockCache.delete).toHaveBeenCalledTimes(3);
			expect(sleep).toHaveBeenCalledTimes(2);
			expect(sleep).toHaveBeenNthCalledWith(1, 100);
			expect(sleep).toHaveBeenNthCalledWith(2, 200);
			expect(recordDiscoveryMetrics).not.toHaveBeenCalled();
		});

		test("retries when findService throws and succeeds on retry", async () => {
			mockDiscovery.findCachedService
				.mockRejectedValueOnce(new Error("temp failure"))
				.mockResolvedValueOnce(instance);
			mockCircuitBreaker.isOpen.mockReturnValue(false);

			const result = await handler.attemptDiscovery(discoveryCtx);

			expect(result).toBe(instance);
			expect(mockDiscovery.findCachedService).toHaveBeenCalledTimes(2);
			expect(sleep).toHaveBeenCalledTimes(1);
			expect(sleep).toHaveBeenCalledWith(100);
			expect(recordDiscoveryMetrics).toHaveBeenCalledWith(
				{ serviceName: serviceId, startTime },
				"success" as DiscoveryResult
			);
		});

		test("throws last error when findService throws on all attempts", async () => {
			mockDiscovery.findCachedService.mockRejectedValue(
				new Error("service failure")
			);

			await expect(handler.attemptDiscovery(discoveryCtx)).rejects.toThrow(
				"service failure"
			);

			expect(mockDiscovery.findCachedService).toHaveBeenCalledTimes(3);
			expect(sleep).toHaveBeenCalledTimes(2);
			expect(sleep).toHaveBeenNthCalledWith(1, 100);
			expect(sleep).toHaveBeenNthCalledWith(2, 200);
		});

		test("wraps non-Error thrown values in Error via _captureError", async () => {
			mockDiscovery.findCachedService.mockRejectedValue("string error");

			await expect(handler.attemptDiscovery(discoveryCtx)).rejects.toThrow(
				"string error"
			);
		});

		test("uses exponential backoff for retry delays", async () => {
			mockDiscovery.findCachedService.mockRejectedValue(new Error("fail"));

			await expect(handler.attemptDiscovery(discoveryCtx)).rejects.toThrow(
				"fail"
			);

			expect(sleep).toHaveBeenCalledTimes(2);
			expect(sleep).toHaveBeenNthCalledWith(1, 100);
			expect(sleep).toHaveBeenNthCalledWith(2, 200);
		});
	});

	describe("fallbackToStaleCache", () => {
		test("returns stale instance when cache has one", async () => {
			mockCache.getStale.mockResolvedValue(instance);

			const result = await handler.fallbackToStaleCache(discoveryCtx);

			expect(result).toBe(instance);
			expect(mockCache.getStale).toHaveBeenCalledWith(serviceId);
			expect(jest.mocked(getLogger().warn)).toHaveBeenCalledWith(
				"Circuit breaker exhausted — returning stale cached instance as fallback",
				{
					serviceName: svcInstanceName,
					instanceId: instance.instanceId,
				}
			);
			expect(recordDiscoveryMetrics).toHaveBeenCalledWith(
				{ serviceName: serviceId, startTime },
				"degraded" as DiscoveryResult
			);
		});

		test("returns an instance past the cache TTL when discovery is down", async () => {
			jest.useFakeTimers();
			const cache = new ServiceCache(toDurationMs(30_000));
			await cache.set({ serviceName: serviceId, instance });
			jest.advanceTimersByTime(31_000);
			const realHandler = newHandler(cache, mockCircuitBreaker);
			jest
				.spyOn(realHandler, "findCachedService")
				.mockRejectedValue(new Error("discovery down"));

			await expect(realHandler.attemptDiscovery(discoveryCtx)).rejects.toThrow(
				"discovery down"
			);
			expect(await cache.get(serviceId)).toBeNull();
			expect(await realHandler.fallbackToStaleCache(discoveryCtx)).toEqual(
				instance
			);
			jest.useRealTimers();
		});

		test("returns null when no stale cache exists", async () => {
			mockCache.getStale.mockResolvedValue(null);

			const result = await handler.fallbackToStaleCache(discoveryCtx);

			expect(result).toBeNull();
			expect(mockCache.getStale).toHaveBeenCalledWith(serviceId);
			expect(jest.mocked(getLogger().warn)).not.toHaveBeenCalled();
			expect(recordDiscoveryMetrics).not.toHaveBeenCalled();
		});

		test("returns null when cache lookup throws", async () => {
			mockCache.getStale.mockRejectedValue(new Error("cache error"));

			const result = await handler.fallbackToStaleCache(discoveryCtx);

			expect(result).toBeNull();
			expect(mockCache.getStale).toHaveBeenCalledWith(serviceId);
			expect(jest.mocked(getLogger().debug)).toHaveBeenCalledWith(
				"Cache lookup failed in fallback path",
				{ error: new Error("cache error") }
			);
			expect(jest.mocked(getLogger().warn)).not.toHaveBeenCalled();
			expect(recordDiscoveryMetrics).not.toHaveBeenCalled();
		});
	});

	describe("circuit breaker interactions", () => {
		test("checks isOpen on each attempt", async () => {
			mockDiscovery.findCachedService.mockResolvedValue(instance);
			mockCircuitBreaker.isOpen.mockReturnValue(true);

			await expect(handler.attemptDiscovery(discoveryCtx)).rejects.toThrow(
				"Discovery failed"
			);

			expect(mockCircuitBreaker.isOpen).toHaveBeenCalledTimes(3);
			expect(mockCircuitBreaker.isOpen).toHaveBeenCalledWith(
				instance.instanceId
			);
		});
	});
});

describe("DiscoveryRetryHandler.findCachedService", () => {
	const mockBreaker = () => ({}) as unknown as DiscoveryCircuitBreaker;
	let discovery: DiscoveryRetryHandler;
	let cache: jest.Mocked<ServiceCache>;
	let httpClient: jest.Mocked<HttpClient>;
	let healthChecker: jest.Mocked<ServiceHealthChecker>;

	const FixedTimestamp = 1_700_000_000_000;
	const serviceName = toServiceId("user-service");
	const svcInstanceName = serviceName as unknown as ServiceInstanceName;
	const instance: ServiceInstance = {
		host: IPAddress.of("127.0.0.1"),
		port: Port.of(8080),
		instanceId: toInstanceId("instance-1"),
		lastHeartbeat: UnixTimestamp.of(FixedTimestamp),
		protocol: Protocol.Http,
		registeredAt: UnixTimestamp.of(FixedTimestamp),
		serviceName: serviceName,
		version: toVersion("1.0.0"),
		ttl: toDurationMs(30000),
	};

	function createMockCache(): jest.Mocked<ServiceCache> {
		return {
			get: jest
				.fn<() => Promise<ServiceInstance | null>>()
				.mockResolvedValue(null),
			set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			delete: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			clear: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		} as unknown as jest.Mocked<ServiceCache>;
	}

	function createMockHttpClient(): jest.Mocked<HttpClient> {
		return {
			get: jest
				.fn<
					(url: string, options?: Record<string, unknown>) => Promise<unknown>
				>()
				.mockResolvedValue(undefined),
		} as unknown as jest.Mocked<HttpClient>;
	}

	function createMockHealthChecker(): jest.Mocked<ServiceHealthChecker> {
		return {
			isHealthy: jest
				.fn<(instance: ServiceInstance) => Promise<boolean>>()
				.mockResolvedValue(true),
			locate: jest.fn((instance: ServiceInstance) => instance.host),
		} as unknown as jest.Mocked<ServiceHealthChecker>;
	}

	beforeEach(() => {
		cache = createMockCache();
		httpClient = createMockHttpClient();
		healthChecker = createMockHealthChecker();

		discovery = new DiscoveryRetryHandler(
			{
				httpClient,
				serviceCache: cache,
				config: {
					addressManagerUrl: "http://localhost:8443",
					discoveryTimeoutMs: DurationMs.of(5000),
					servicePort: Port.of(0),
					tokenRefreshIntervalMs: DurationMs.of(0),
					ttlRefreshIntervalMs: DurationMs.of(0),
					servicePingTimeoutMs: DurationMs.of(0),
					cacheTtlMs: DurationMs.of(0),
					identity: {
						serviceName: toServiceId("test-service"),
						instanceId: toInstanceId("test-instance"),
					},
					tls: {
						caPath: FilePath.of("/path/to/ca.pem"),
						certPath: FilePath.of("/path/to/cert.pem"),
						keyPath: FilePath.of("/path/to/key.pem"),
					},
				} as AddressManagerConfig,
				healthChecker,
			},
			mockBreaker()
		);
	});

	test("returns cached instance if healthy", async () => {
		cache.get.mockResolvedValue(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findCachedService(svcInstanceName);

		expect(result).toEqual(instance);
		expect(cache.get).toHaveBeenCalledWith(serviceName);
		expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
		expect(cache.delete).not.toHaveBeenCalled();
	});

	test("targets the instance through the located address, not its registered IP", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce([instance]);
		healthChecker.locate.mockReturnValueOnce("message-manager");

		const result = await discovery.findCachedService(svcInstanceName);

		expect(result.host).toBe("message-manager");
		expect(result.port).toBe(instance.port);
	});

	test("fetches from AddressManager if cache is empty", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce([instance]);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findCachedService(svcInstanceName);

		expect(result).toEqual(instance);
		expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
		expect(cache.set).toHaveBeenCalledWith({ serviceName, instance });
	});

	test("invalidates cache and refetches if cached instance is unhealthy", async () => {
		cache.get.mockResolvedValue(instance);
		httpClient.get.mockResolvedValueOnce([instance]);
		healthChecker.isHealthy.mockResolvedValueOnce(false);
		healthChecker.isHealthy.mockResolvedValueOnce(true);

		const result = await discovery.findCachedService(svcInstanceName);

		expect(cache.delete).toHaveBeenCalledWith(serviceName);
		expect(result).toEqual(instance);
		expect(cache.set).toHaveBeenCalledWith({ serviceName, instance });
	});

	test("throws ServiceNotFoundError if service not registered", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockRejectedValue("");

		await expect(discovery.findCachedService(svcInstanceName)).rejects.toThrow(
			Error
		);

		expect(cache.delete).not.toHaveBeenCalled();
	});

	test("passes timeout option to HttpClient.get", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce([instance]);
		healthChecker.isHealthy.mockResolvedValue(true);

		await discovery.findCachedService(svcInstanceName);

		expect(httpClient.get).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ timeoutMs: 5000 }),
			expect.anything()
		);
	});

	test("takes the first instance of the list", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce([instance]);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findCachedService(svcInstanceName);

		expect(result).toEqual(instance);
		expect(cache.set).toHaveBeenCalledWith({ serviceName, instance });
	});

	test("throws ServiceNotFoundError when AddressManager returns empty instances", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValue([]);

		await expect(discovery.findCachedService(svcInstanceName)).rejects.toThrow(
			Error
		);
		await expect(
			discovery.findCachedService(svcInstanceName)
		).rejects.toMatchObject({
			message: 'Service "user-service" has no registered instances',
		});

		expect(cache.delete).not.toHaveBeenCalled();
	});

	test("throws ServiceUnreachableError if fetched service is unhealthy", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce([instance]);
		healthChecker.isHealthy.mockResolvedValue(false);

		await expect(discovery.findCachedService(svcInstanceName)).rejects.toThrow(
			'Service "user-service" is unreachable'
		);

		expect(cache.delete).toHaveBeenCalledWith(serviceName);
		expect(cache.set).not.toHaveBeenCalled();
	});

	test("sets fetched healthy service in cache", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce([instance]);
		healthChecker.isHealthy.mockResolvedValue(true);

		await discovery.findCachedService(svcInstanceName);

		expect(cache.set).toHaveBeenCalledWith({ serviceName, instance });
	});
});
