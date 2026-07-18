import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
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
} from "@trading-model/common/domain/primitives";
import { Protocol } from "@trading-model/validation/contracts/service-registry.types";
import type { ServiceInstance } from "../../src/client/type";
import type { AddressManagerConfig } from "../../src/config/address-manager-config";
import type { ServiceCache } from "../../src/discovery/service-cache";
import { ServiceDiscovery } from "../../src/discovery/service-discovery";
import type { ServiceHealthChecker } from "../../src/discovery/service-health-checker";

describe("ServiceDiscovery", () => {
	let discovery: ServiceDiscovery;
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
		} as unknown as jest.Mocked<ServiceHealthChecker>;
	}

	beforeEach(() => {
		cache = createMockCache();
		httpClient = createMockHttpClient();
		healthChecker = createMockHealthChecker();

		discovery = new ServiceDiscovery({
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
				discoveryUrls: ["http://localhost:8443"],
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
		});
	});

	test("returns cached instance if healthy", async () => {
		cache.get.mockResolvedValue(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findService(svcInstanceName);

		expect(result).toEqual(instance);
		expect(cache.get).toHaveBeenCalledWith(serviceName);
		expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
		expect(cache.delete).not.toHaveBeenCalled();
	});

	test("findServiceInRegion returns cached instance if healthy", async () => {
		cache.get.mockResolvedValue(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findServiceInRegion(
			svcInstanceName,
			"us-east-1"
		);

		expect(result).toEqual(instance);
		expect(cache.get).toHaveBeenCalledWith(serviceName);
		expect(cache.delete).not.toHaveBeenCalled();
	});

	test("fetches from AddressManager if cache is empty", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findService(svcInstanceName);

		expect(result).toEqual(instance);
		expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
		expect(cache.set).toHaveBeenCalledWith({ serviceName, instance });
	});

	test("invalidates cache and refetches if cached instance is unhealthy", async () => {
		cache.get.mockResolvedValue(instance);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValueOnce(false);
		healthChecker.isHealthy.mockResolvedValueOnce(true);

		const result = await discovery.findService(svcInstanceName);

		expect(cache.delete).toHaveBeenCalledWith(serviceName);
		expect(result).toEqual(instance);
		expect(cache.set).toHaveBeenCalledWith({ serviceName, instance });
	});

	test("throws ServiceNotFoundError if service not registered", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockRejectedValue("");

		await expect(discovery.findService(svcInstanceName)).rejects.toThrow(Error);

		expect(cache.delete).not.toHaveBeenCalled();
	});

	test("passes timeout option to HttpClient.get", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		await discovery.findService(svcInstanceName);

		expect(httpClient.get).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ timeoutMs: 5000 })
		);
	});

	test("handles array response from AddressManager by taking first element", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce([instance]);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findService(svcInstanceName);

		expect(result).toEqual(instance);
		expect(cache.set).toHaveBeenCalledWith({ serviceName, instance });
	});

	test("throws ServiceNotFoundError when AddressManager returns empty instances", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce(null);

		await expect(discovery.findService(svcInstanceName)).rejects.toThrow(Error);
		await expect(discovery.findService(svcInstanceName)).rejects.toMatchObject({
			message: 'Service "user-service" has no registered instances',
		});

		expect(cache.delete).not.toHaveBeenCalled();
	});

	test("throws ServiceUnreachableError if fetched service is unhealthy", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValue(false);

		await expect(discovery.findService(svcInstanceName)).rejects.toThrow(
			AppError
		);

		expect(cache.delete).toHaveBeenCalledWith(serviceName);
		expect(cache.set).not.toHaveBeenCalled();
	});

	test("sets fetched healthy service in cache", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		await discovery.findService(svcInstanceName);

		expect(cache.set).toHaveBeenCalledWith({ serviceName, instance });
	});

	test("findServiceInRegion invalidates cache when cached instance is unhealthy", async () => {
		cache.get.mockResolvedValue(instance);
		healthChecker.isHealthy.mockResolvedValueOnce(false);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValueOnce(true);

		const result = await discovery.findServiceInRegion(
			svcInstanceName,
			"us-east-1"
		);

		expect(cache.delete).toHaveBeenCalledWith(serviceName);
		expect(result).toEqual(instance);
	});

	test("findServiceInRegion falls back to non-region lookup when region HTTP fails", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockRejectedValueOnce(new Error("region unavailable"));
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findServiceInRegion(
			svcInstanceName,
			"us-east-1"
		);

		expect(result).toEqual(instance);
		expect(httpClient.get).toHaveBeenCalledTimes(2);
	});

	test("findServiceInRegion falls back when all region instances are unhealthy", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce([instance]);
		healthChecker.isHealthy.mockResolvedValueOnce(false);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValueOnce(true);

		const result = await discovery.findServiceInRegion(
			svcInstanceName,
			"us-east-1"
		);

		expect(result).toEqual(instance);
		expect(httpClient.get).toHaveBeenCalledTimes(2);
	});

	test("findServiceInRegion skips null entries in region instance list", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce([null, instance]);
		healthChecker.isHealthy.mockResolvedValueOnce(true);

		const result = await discovery.findServiceInRegion(
			svcInstanceName,
			"us-east-1"
		);

		expect(result).toEqual(instance);
		expect(healthChecker.isHealthy).toHaveBeenCalledTimes(1);
	});

	test("acquireConnection increments connection count for new instance", () => {
		const id = toInstanceId("instance-1");
		discovery.acquireConnection(id);
		expect((discovery as any)._connections.get(id)).toBe(1);
	});

	test("acquireConnection increments connection count for existing instance", () => {
		const id = toInstanceId("instance-1");
		discovery.acquireConnection(id);
		discovery.acquireConnection(id);
		expect((discovery as any)._connections.get(id)).toBe(2);
	});

	test("releaseConnection decrements count and removes when count reaches zero", () => {
		const id = toInstanceId("instance-1");
		discovery.acquireConnection(id);
		discovery.releaseConnection(id);
		expect((discovery as any)._connections.has(id)).toBe(false);
	});

	test("releaseConnection decrements count but keeps entry when count > 1", () => {
		const id = toInstanceId("instance-1");
		discovery.acquireConnection(id);
		discovery.acquireConnection(id);
		discovery.releaseConnection(id);
		expect((discovery as any)._connections.get(id)).toBe(1);
	});

	test("releaseConnection does nothing when instance not in map", () => {
		const id = toInstanceId("unknown-instance");
		expect(() => discovery.releaseConnection(id)).not.toThrow();
	});

	test("findAllServices delegates to resolver", async () => {
		const mockResolver = (discovery as any)._resolver;
		mockResolver.findAllServices = jest
			.fn<() => Promise<ServiceInstance[]>>()
			.mockResolvedValue([instance]);

		const result = await discovery.findAllServices(svcInstanceName);

		expect(result).toEqual([instance]);
		expect(mockResolver.findAllServices).toHaveBeenCalledWith(svcInstanceName);
	});
});
