import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { Protocol } from "@trading-model/common/contracts/service-registry.types";
import {
	IPAddress,
	Port,
	toDurationMs,
	toInstanceId,
	toServiceId,
	toVersion,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../../src/client/type";
import type { DiscoveryCircuitBreaker } from "../../src/discovery/circuit-breaker";
import { DiscoveryRetryHandler } from "../../src/discovery/discovery-retry-handler";
import type { IServiceCache } from "../../src/discovery/service-cache.interface";
import type { ServiceDiscovery } from "../../src/discovery/service-discovery";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		warn: jest.fn(),
		debug: jest.fn(),
	},
}));
jest.mock("@trading-model/common/utils/sleep", () => ({
	sleep: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
}));
jest.mock("../../src/metrics", () => ({
	DiscoveryResult: {
		Success: "success",
		Failure: "failure",
		Degraded: "degraded",
	},
	recordDiscoveryMetrics: jest.fn(),
}));

import { logger } from "@trading-model/common/config/logger";
import { sleep } from "@trading-model/common/utils/sleep";
import { recordDiscoveryMetrics } from "../../src/metrics";

describe("DiscoveryRetryHandler", () => {
	const FixedTimestamp = 1_700_000_000_000;
	const startTime = Date.now();
	const serviceId = toServiceId("user-service");
	const svcInstanceName = serviceId as unknown as ServiceInstanceName;
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
	let mockCache: jest.Mocked<IServiceCache>;
	let mockCircuitBreaker: jest.Mocked<DiscoveryCircuitBreaker>;

	function createMockDiscovery(): jest.Mocked<ServiceDiscovery> {
		return {
			findService:
				jest.fn<(name: ServiceInstanceName) => Promise<ServiceInstance>>(),
			acquireConnection: jest.fn<(id: typeof instance.instanceId) => void>(),
			releaseConnection: jest.fn(),
			findServiceInRegion: jest.fn(),
			findAllServices: jest.fn(),
		} as unknown as jest.Mocked<ServiceDiscovery>;
	}

	function createMockCache(): jest.Mocked<IServiceCache> {
		return {
			get: jest
				.fn<() => Promise<ServiceInstance | null>>()
				.mockResolvedValue(null),
			set: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			invalidate: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			clear: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
			entries: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([]),
			getVersion: jest.fn<() => Promise<number>>().mockResolvedValue(0),
			setCircuitState: jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined),
			getCircuitState: jest
				.fn<() => Promise<unknown>>()
				.mockResolvedValue(null),
			deleteCircuitState: jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined),
			stop: jest.fn(),
		} as unknown as jest.Mocked<IServiceCache>;
	}

	function createMockCircuitBreaker(): jest.Mocked<DiscoveryCircuitBreaker> {
		return {
			loadFromStore: jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined),
			isOpen: jest.fn<() => boolean>().mockReturnValue(false),
			check: jest.fn(),
			isAllowed: jest.fn(),
			recordFailure: jest.fn(),
			recordSuccess: jest.fn(),
			recordLatency: jest.fn(),
			getState: jest.fn(),
			getFailureCount: jest.fn(),
			getStateSummary: jest.fn(),
			call: jest.fn(),
			clear: jest.fn(),
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

			const result = await handler.attemptDiscovery(svcInstanceName, startTime);

			expect(result).toBe(instance);
			expect(mockCircuitBreaker.loadFromStore).toHaveBeenCalledWith(
				instance.instanceId
			);
			expect(mockCircuitBreaker.isOpen).toHaveBeenCalledWith(
				instance.instanceId
			);
			expect(mockDiscovery.acquireConnection).toHaveBeenCalledWith(
				instance.instanceId
			);
			expect(recordDiscoveryMetrics).toHaveBeenCalledWith(
				{ serviceName: serviceId, startTime },
				"success"
			);
			expect(mockCache.invalidate).not.toHaveBeenCalled();
			expect(sleep).not.toHaveBeenCalled();
		});

		test("retries when circuit breaker is open and succeeds on subsequent attempt", async () => {
			mockDiscovery.findService.mockResolvedValue(instance);
			mockCircuitBreaker.isOpen
				.mockReturnValueOnce(true)
				.mockReturnValueOnce(false);

			const result = await handler.attemptDiscovery(svcInstanceName, startTime);

			expect(result).toBe(instance);
			expect(mockCircuitBreaker.loadFromStore).toHaveBeenCalledTimes(2);
			expect(mockCircuitBreaker.isOpen).toHaveBeenCalledTimes(2);
			expect(mockCache.invalidate).toHaveBeenCalledTimes(1);
			expect(mockCache.invalidate).toHaveBeenCalledWith(serviceId);
			expect(mockDiscovery.acquireConnection).toHaveBeenCalledTimes(1);
			expect(sleep).toHaveBeenCalledTimes(1);
			expect(sleep).toHaveBeenCalledWith(100);
			expect(recordDiscoveryMetrics).toHaveBeenCalledWith(
				{ serviceName: serviceId, startTime },
				"success"
			);
		});

		test("throws Discovery failed error when all retries exhausted with circuit breaker open", async () => {
			mockDiscovery.findService.mockResolvedValue(instance);
			mockCircuitBreaker.isOpen.mockReturnValue(true);

			await expect(
				handler.attemptDiscovery(svcInstanceName, startTime)
			).rejects.toThrow("Discovery failed");

			expect(mockCircuitBreaker.loadFromStore).toHaveBeenCalledTimes(3);
			expect(mockCircuitBreaker.isOpen).toHaveBeenCalledTimes(3);
			expect(mockCache.invalidate).toHaveBeenCalledTimes(3);
			expect(sleep).toHaveBeenCalledTimes(2);
			expect(sleep).toHaveBeenNthCalledWith(1, 100);
			expect(sleep).toHaveBeenNthCalledWith(2, 200);
			expect(mockDiscovery.acquireConnection).not.toHaveBeenCalled();
			expect(recordDiscoveryMetrics).not.toHaveBeenCalled();
		});

		test("retries when findService throws and succeeds on retry", async () => {
			mockDiscovery.findService
				.mockRejectedValueOnce(new Error("temp failure"))
				.mockResolvedValueOnce(instance);
			mockCircuitBreaker.isOpen.mockReturnValue(false);

			const result = await handler.attemptDiscovery(svcInstanceName, startTime);

			expect(result).toBe(instance);
			expect(mockDiscovery.findService).toHaveBeenCalledTimes(2);
			expect(sleep).toHaveBeenCalledTimes(1);
			expect(sleep).toHaveBeenCalledWith(100);
			expect(recordDiscoveryMetrics).toHaveBeenCalledWith(
				{ serviceName: serviceId, startTime },
				"success"
			);
		});

		test("throws last error when findService throws on all attempts", async () => {
			mockDiscovery.findService.mockRejectedValue(new Error("service failure"));

			await expect(
				handler.attemptDiscovery(svcInstanceName, startTime)
			).rejects.toThrow("service failure");

			expect(mockDiscovery.findService).toHaveBeenCalledTimes(3);
			expect(sleep).toHaveBeenCalledTimes(2);
			expect(sleep).toHaveBeenNthCalledWith(1, 100);
			expect(sleep).toHaveBeenNthCalledWith(2, 200);
		});

		test("wraps non-Error thrown values in Error via _captureError", async () => {
			mockDiscovery.findService.mockRejectedValue("string error");

			await expect(
				handler.attemptDiscovery(svcInstanceName, startTime)
			).rejects.toThrow("string error");
		});

		test("uses exponential backoff for retry delays", async () => {
			mockDiscovery.findService.mockRejectedValue(new Error("fail"));

			await expect(
				handler.attemptDiscovery(svcInstanceName, startTime)
			).rejects.toThrow("fail");

			expect(sleep).toHaveBeenCalledTimes(2);
			expect(sleep).toHaveBeenNthCalledWith(1, 100);
			expect(sleep).toHaveBeenNthCalledWith(2, 200);
		});
	});

	describe("fallbackToStaleCache", () => {
		test("returns stale instance when cache has one", async () => {
			mockCache.get.mockResolvedValue(instance);

			const result = await handler.fallbackToStaleCache(
				svcInstanceName,
				startTime
			);

			expect(result).toBe(instance);
			expect(mockCache.get).toHaveBeenCalledWith(serviceId);
			expect(jest.mocked(logger.warn)).toHaveBeenCalledWith(
				"Circuit breaker exhausted — returning stale cached instance as fallback",
				{
					serviceName: svcInstanceName,
					instanceId: instance.instanceId,
				}
			);
			expect(recordDiscoveryMetrics).toHaveBeenCalledWith(
				{ serviceName: serviceId, startTime },
				"degraded"
			);
		});

		test("returns null when no stale cache exists", async () => {
			mockCache.get.mockResolvedValue(null);

			const result = await handler.fallbackToStaleCache(
				svcInstanceName,
				startTime
			);

			expect(result).toBeNull();
			expect(mockCache.get).toHaveBeenCalledWith(serviceId);
			expect(jest.mocked(logger.warn)).not.toHaveBeenCalled();
			expect(recordDiscoveryMetrics).not.toHaveBeenCalled();
		});

		test("returns null when cache lookup throws", async () => {
			mockCache.get.mockRejectedValue(new Error("cache error"));

			const result = await handler.fallbackToStaleCache(
				svcInstanceName,
				startTime
			);

			expect(result).toBeNull();
			expect(mockCache.get).toHaveBeenCalledWith(serviceId);
			expect(jest.mocked(logger.debug)).toHaveBeenCalledWith(
				"Cache lookup failed in fallback path",
				{ error: new Error("cache error") }
			);
			expect(jest.mocked(logger.warn)).not.toHaveBeenCalled();
			expect(recordDiscoveryMetrics).not.toHaveBeenCalled();
		});
	});

	describe("circuit breaker interactions", () => {
		test("calls loadFromStore for each attempt and checks isOpen", async () => {
			mockDiscovery.findService.mockResolvedValue(instance);
			mockCircuitBreaker.isOpen.mockReturnValue(true);

			await expect(
				handler.attemptDiscovery(svcInstanceName, startTime)
			).rejects.toThrow("Discovery failed");

			expect(mockCircuitBreaker.loadFromStore).toHaveBeenCalledTimes(3);
			expect(mockCircuitBreaker.loadFromStore).toHaveBeenCalledWith(
				instance.instanceId
			);
			expect(mockCircuitBreaker.isOpen).toHaveBeenCalledTimes(3);
			expect(mockCircuitBreaker.isOpen).toHaveBeenCalledWith(
				instance.instanceId
			);
		});

		test("loadFromStore rejection is silently caught", async () => {
			mockDiscovery.findService.mockResolvedValue(instance);
			mockCircuitBreaker.loadFromStore.mockRejectedValue(
				new Error("store error")
			);
			mockCircuitBreaker.isOpen.mockReturnValue(false);

			const result = await handler.attemptDiscovery(svcInstanceName, startTime);

			expect(result).toBe(instance);
			expect(mockCircuitBreaker.loadFromStore).toHaveBeenCalledWith(
				instance.instanceId
			);
		});
	});
});
