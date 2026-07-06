import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { HttpClient } from "@trading-model/common/config/http-client";
import { AppError } from "@trading-model/common/utils/errors";
import type { ServiceInstance } from "../../src/client/type";
import type { AddressManagerConfig } from "../../src/config/address-manager-config";
import type { ServiceCache } from "../../src/discovery/service-cache";
import { ServiceDiscovery } from "../../src/discovery/service-discovery";
import type { ServiceHealthChecker } from "../../src/discovery/service-health-checker";
import type { IPAddress, Port } from "@trading-model/common/domain/primitives";

describe("ServiceDiscovery", () => {
	let discovery: ServiceDiscovery;
	let cache: jest.Mocked<ServiceCache>;
	let httpClient: jest.Mocked<HttpClient>;
	let healthChecker: jest.Mocked<ServiceHealthChecker>;

	const FixedTimestamp = 1_700_000_000_000;
	const serviceName = "user-service";
	const instance: ServiceInstance = {
		ip: "127.0.0.1" as unknown as IPAddress,
		port: 8080 as unknown as Port,
		instanceId: "instance-1",
		lastHeartbeat: FixedTimestamp,
		protocol: "http",
		registeredAt: FixedTimestamp,
		serviceName: serviceName,
		version: "1.0.0",
		ttl: 30000,
	};

	function createMockCache(): jest.Mocked<ServiceCache> {
		return {
			get: jest
				.fn<(serviceName: string) => Promise<ServiceInstance | null>>()
				.mockResolvedValue(null),
			set: jest
				.fn<(serviceName: string, instance: ServiceInstance) => Promise<void>>()
				.mockResolvedValue(undefined),
			invalidate: jest
				.fn<(serviceName: string) => Promise<void>>()
				.mockResolvedValue(undefined),
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
				addressManagerUrl: "ee",
				discoveryTimeoutMs: 5000,
				servicePort: 0,
				tokenRefreshIntervalMs: 0,
				ttlRefreshIntervalMs: 0,
				servicePingTimeoutMs: 0,
				cacheTtlMs: 0,
				discoveryUrls: ["http://localhost:8443"],
				identity: { serviceName: "test-service", instanceId: "test-instance" },
				tls: { caPath: "/path/to/ca.pem", certPath: "/path/to/cert.pem", keyPath: "/path/to/key.pem" },
			} as AddressManagerConfig,
			healthChecker,
		});
	});

	test("returns cached instance if healthy", async () => {
		cache.get.mockResolvedValue(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findService(serviceName);

		expect(result).toEqual(instance);
		expect(cache.get).toHaveBeenCalledWith(serviceName);
		expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
		expect(cache.invalidate).not.toHaveBeenCalled();
	});

	test("findServiceInRegion returns cached instance if healthy", async () => {
		cache.get.mockResolvedValue(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findServiceInRegion(
			serviceName,
			"us-east-1"
		);

		expect(result).toEqual(instance);
		expect(cache.get).toHaveBeenCalledWith(serviceName);
		expect(cache.invalidate).not.toHaveBeenCalled();
	});

	test("fetches from AddressManager if cache is empty", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findService(serviceName);

		expect(result).toEqual(instance);
		expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
		expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
	});

	test("invalidates cache and refetches if cached instance is unhealthy", async () => {
		cache.get.mockResolvedValue(instance);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValueOnce(false);
		healthChecker.isHealthy.mockResolvedValueOnce(true);

		const result = await discovery.findService(serviceName);

		expect(cache.invalidate).toHaveBeenCalledWith(serviceName);
		expect(result).toEqual(instance);
		expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
	});

	test("throws ServiceNotFoundError if service not registered", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockRejectedValue("");

		await expect(discovery.findService(serviceName)).rejects.toThrow(AppError);

		expect(cache.invalidate).not.toHaveBeenCalled();
	});

	test("passes timeout option to HttpClient.get", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		await discovery.findService(serviceName);

		expect(httpClient.get).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ timeoutMs: 5000 })
		);
	});

	test("handles array response from AddressManager by taking first element", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce([instance]);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findService(serviceName);

		expect(result).toEqual(instance);
		expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
	});

	test("throws ServiceNotFoundError when AddressManager returns empty instances", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce(null);

		await expect(discovery.findService(serviceName)).rejects.toThrow(AppError);
		await expect(discovery.findService(serviceName)).rejects.toMatchObject({
			message: 'Service "user-service" has no registered instances',
		});

		expect(cache.invalidate).not.toHaveBeenCalled();
	});

	test("throws ServiceUnreachableError if fetched service is unhealthy", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValue(false);

		await expect(discovery.findService(serviceName)).rejects.toThrow(AppError);

		expect(cache.invalidate).toHaveBeenCalledWith(serviceName);
		expect(cache.set).not.toHaveBeenCalled();
	});

	test("sets fetched healthy service in cache", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		await discovery.findService(serviceName);

		expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
	});

	test("findServiceInRegion invalidates cache when cached instance is unhealthy", async () => {
		cache.get.mockResolvedValue(instance);
		healthChecker.isHealthy.mockResolvedValueOnce(false);
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValueOnce(true);

		const result = await discovery.findServiceInRegion(
			serviceName,
			"us-east-1"
		);

		expect(cache.invalidate).toHaveBeenCalledWith(serviceName);
		expect(result).toEqual(instance);
	});

	test("findServiceInRegion falls back to non-region lookup when region HTTP fails", async () => {
		cache.get.mockResolvedValue(null);
		httpClient.get.mockRejectedValueOnce(new Error("region unavailable"));
		httpClient.get.mockResolvedValueOnce(instance);
		healthChecker.isHealthy.mockResolvedValue(true);

		const result = await discovery.findServiceInRegion(
			serviceName,
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
			serviceName,
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
			serviceName,
			"us-east-1"
		);

		expect(result).toEqual(instance);
		expect(healthChecker.isHealthy).toHaveBeenCalledTimes(1);
	});
});
