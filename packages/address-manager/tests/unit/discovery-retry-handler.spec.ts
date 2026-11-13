import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { Protocol } from "@trading-model/contracts/service-registry-types";
import {
	IPAddress,
	Port,
	toDurationMs,
	toInstanceId,
	toServiceId,
	toVersion,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { ServiceCache } from "../../src/adapters/outbound/discovery/service-cache";
import type { DiscoveryCircuitBreaker } from "../../src/application/discovery/circuit-breaker";
import { DiscoveryRetryHandler } from "../../src/application/discovery/discovery-retry-handler";
import type { ServiceDiscovery } from "../../src/application/discovery/service-discovery";
import type { ServiceInstance } from "../../src/domain/client/type";
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
	let mockDiscovery: jest.Mocked<ServiceDiscovery>;
	let mockCache: jest.Mocked<ServiceCachePort>;
	let mockCircuitBreaker: jest.Mocked<DiscoveryCircuitBreaker>;

	function createMockDiscovery(): jest.Mocked<ServiceDiscovery> {
		return {
			findService:
				jest.fn<(name: ServiceInstanceName) => Promise<ServiceInstance>>(),
			findAllServices: jest.fn<(...args: any[]) => any>(),
		} as unknown as jest.Mocked<ServiceDiscovery>;
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

		mockDiscovery = createMockDiscovery();
		mockCache = createMockCache();
		mockCircuitBreaker = createMockCircuitBreaker();

		handler = new DiscoveryRetryHandler(
			mockDiscovery,
			mockCache,
			mockCircuitBreaker
		);
	});

	describe("attemptDiscovery", () => {
		test("returns instance on first attempt when circuit breaker is closed (success path)", async () => {
			mockDiscovery.findService.mockResolvedValue(instance);
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
			mockDiscovery.findService.mockResolvedValue(instance);
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
			mockDiscovery.findService.mockResolvedValue(instance);
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
			mockDiscovery.findService
				.mockRejectedValueOnce(new Error("temp failure"))
				.mockResolvedValueOnce(instance);
			mockCircuitBreaker.isOpen.mockReturnValue(false);

			const result = await handler.attemptDiscovery(discoveryCtx);

			expect(result).toBe(instance);
			expect(mockDiscovery.findService).toHaveBeenCalledTimes(2);
			expect(sleep).toHaveBeenCalledTimes(1);
			expect(sleep).toHaveBeenCalledWith(100);
			expect(recordDiscoveryMetrics).toHaveBeenCalledWith(
				{ serviceName: serviceId, startTime },
				"success" as DiscoveryResult
			);
		});

		test("throws last error when findService throws on all attempts", async () => {
			mockDiscovery.findService.mockRejectedValue(new Error("service failure"));

			await expect(handler.attemptDiscovery(discoveryCtx)).rejects.toThrow(
				"service failure"
			);

			expect(mockDiscovery.findService).toHaveBeenCalledTimes(3);
			expect(sleep).toHaveBeenCalledTimes(2);
			expect(sleep).toHaveBeenNthCalledWith(1, 100);
			expect(sleep).toHaveBeenNthCalledWith(2, 200);
		});

		test("wraps non-Error thrown values in Error via _captureError", async () => {
			mockDiscovery.findService.mockRejectedValue("string error");

			await expect(handler.attemptDiscovery(discoveryCtx)).rejects.toThrow(
				"string error"
			);
		});

		test("uses exponential backoff for retry delays", async () => {
			mockDiscovery.findService.mockRejectedValue(new Error("fail"));

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
			mockDiscovery.findService.mockRejectedValue(new Error("discovery down"));
			const realHandler = new DiscoveryRetryHandler(
				mockDiscovery,
				cache,
				mockCircuitBreaker
			);

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
			mockDiscovery.findService.mockResolvedValue(instance);
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
