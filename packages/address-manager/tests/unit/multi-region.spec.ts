import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { Protocol } from "@trading-model/common/contracts/service-registry.types";
import type { IPAddress } from "@trading-model/common/domain/primitives";
import {
	toDurationMs,
	toInstanceId,
	toRegion,
	toServiceId,
	toVersion,
	UnixTimestamp,
	type URLString,
} from "@trading-model/common/domain/primitives";
import { Port } from "@trading-model/common/domain/primitives/port";
import type { ServiceInstance } from "../../src/client/type";
import type { AddressManagerConfig } from "../../src/config/address-manager-config";
import type { ServiceCache } from "../../src/discovery/service-cache";
import { ServiceDiscovery } from "../../src/discovery/service-discovery";
import type { ServiceHealthChecker } from "../../src/discovery/service-health-checker";

const FIXED_TIMESTAMP = 1_700_000_000_000;

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		host: "127.0.0.1" as unknown as IPAddress,
		port: Port.of(8080),
		instanceId: toInstanceId("instance-1"),
		lastHeartbeat: UnixTimestamp.of(FIXED_TIMESTAMP),
		protocol: Protocol.Http,
		registeredAt: UnixTimestamp.of(FIXED_TIMESTAMP),
		serviceName: toServiceId("user-service"),
		version: toVersion("1.0.0"),
		ttl: toDurationMs(30000),
		...overrides,
	};
}

function createMockCache(): jest.Mocked<ServiceCache> {
	return {
		get: jest
			.fn<(name: string) => Promise<ServiceInstance | null>>()
			.mockResolvedValue(null),
		set: jest
			.fn<
				(
					name: string,
					inst: ServiceInstance,
					latencyMs?: number
				) => Promise<void>
			>()
			.mockResolvedValue(undefined),
		invalidate: jest
			.fn<(name: string) => Promise<void>>()
			.mockResolvedValue(undefined),
		clear: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		setCircuitState: jest
			.fn<(instanceId: string, state: unknown) => Promise<void>>()
			.mockResolvedValue(undefined),
		getCircuitState: jest
			.fn<(instanceId: string) => Promise<unknown>>()
			.mockResolvedValue(null),
		deleteCircuitState: jest
			.fn<(instanceId: string) => Promise<void>>()
			.mockResolvedValue(undefined),
	} as unknown as jest.Mocked<ServiceCache>;
}

function createMockHttpClient(): jest.Mocked<HttpClient> {
	return {
		get: jest
			.fn<(url: string) => Promise<unknown>>()
			.mockResolvedValue(undefined),
	} as unknown as jest.Mocked<HttpClient>;
}

function createMockHealthChecker(
	healthy = true
): jest.Mocked<ServiceHealthChecker> {
	return {
		isHealthy: jest.fn<() => Promise<boolean>>().mockResolvedValue(healthy),
		recordLatency:
			jest.fn<(region: string | undefined, latencyMs: number) => void>(),
		getRegionLatency:
			jest.fn<(region: string | undefined) => number | undefined>(),
	} as unknown as jest.Mocked<ServiceHealthChecker>;
}

describe("Multi-Region ServiceDiscovery", () => {
	let discovery: ServiceDiscovery;
	let cache: jest.Mocked<ServiceCache>;
	let httpClient: jest.Mocked<HttpClient>;
	let healthChecker: jest.Mocked<ServiceHealthChecker>;

	const usInstance = makeInstance({
		instanceId: toInstanceId("node-us"),
		host: "10.0.0.1" as unknown as IPAddress,
		region: toRegion("us-east-1"),
	});

	const euInstance = makeInstance({
		instanceId: toInstanceId("node-eu"),
		host: "10.0.1.1" as unknown as IPAddress,
		region: toRegion("eu-west-1"),
	});

	const noRegionInstance = makeInstance({
		instanceId: toInstanceId("node-legacy"),
		host: "10.0.2.1" as unknown as IPAddress,
	});

	beforeEach(() => {
		cache = createMockCache();
		httpClient = createMockHttpClient();
		healthChecker = createMockHealthChecker();
	});

	describe("findServiceInRegion", () => {
		test("should query region-filtered endpoint when preferred region is specified", async () => {
			httpClient.get.mockResolvedValueOnce([usInstance]);
			healthChecker.isHealthy.mockResolvedValue(true);

			discovery = new ServiceDiscovery({
				httpClient,
				serviceCache: cache,
				config: {
					addressManagerUrl: "https://ds:3000",
					discoveryTimeoutMs: 5000,
					servicePort: Port.of(0),
					tokenRefreshIntervalMs: 0,
					ttlRefreshIntervalMs: 0,
					servicePingTimeoutMs: 0,
					cacheTtlMs: 0,
					identity: {
						serviceName: toServiceId("test-service"),
						instanceId: toInstanceId("test-instance"),
					},
					tls: {
						caPath: "/path/to/ca.pem",
						certPath: "/path/to/cert.pem",
						keyPath: "/path/to/key.pem",
					},
					discoveryUrls: ["http://localhost:8443"],
				} as unknown as AddressManagerConfig,
				healthChecker,
			});

			const result = await discovery.findServiceInRegion(
				"user-service" as unknown as ServiceInstanceName,
				toRegion("us-east-1")
			);

			expect(httpClient.get).toHaveBeenCalledWith(
				"https://ds:3000/services/user-service/region/us-east-1" as URLString,
				expect.any(Object)
			);
			expect(result.region).toBe("us-east-1");
		});

		test("should fall back to non-region instances if preferred region has no healthy instances", async () => {
			httpClient.get.mockResolvedValueOnce([usInstance]);
			healthChecker.isHealthy.mockResolvedValue(false);
			httpClient.get.mockResolvedValueOnce([euInstance]);
			healthChecker.isHealthy.mockResolvedValueOnce(true);

			discovery = new ServiceDiscovery({
				httpClient,
				serviceCache: cache,
				config: {
					addressManagerUrl: "https://ds:3000",
					discoveryTimeoutMs: 5000,
					servicePort: Port.of(0),
					tokenRefreshIntervalMs: 0,
					ttlRefreshIntervalMs: 0,
					servicePingTimeoutMs: 0,
					cacheTtlMs: 0,
					identity: {
						serviceName: toServiceId("test-service"),
						instanceId: toInstanceId("test-instance"),
					},
					tls: {
						caPath: "/path/to/ca.pem",
						certPath: "/path/to/cert.pem",
						keyPath: "/path/to/key.pem",
					},
					discoveryUrls: ["http://localhost:8443"],
				} as unknown as AddressManagerConfig,
				healthChecker,
			});

			const result = await discovery.findServiceInRegion(
				"user-service" as unknown as ServiceInstanceName,
				toRegion("us-east-1")
			);
			expect(result).toBeDefined();
		});
	});

	describe("region-preference via config", () => {
		test("should prefer region from config when finding service", async () => {
			httpClient.get.mockResolvedValueOnce([usInstance]);
			healthChecker.isHealthy.mockResolvedValue(true);

			discovery = new ServiceDiscovery({
				httpClient,
				serviceCache: cache,
				config: {
					addressManagerUrl: "https://ds:3000",
					discoveryTimeoutMs: 5000,
					servicePort: Port.of(0),
					tokenRefreshIntervalMs: 0,
					ttlRefreshIntervalMs: 0,
					servicePingTimeoutMs: 0,
					cacheTtlMs: 0,
					region: toRegion("us-east-1"),
					identity: {
						serviceName: toServiceId("test-service"),
						instanceId: toInstanceId("test-instance"),
					},
					tls: {
						caPath: "/path/to/ca.pem",
						certPath: "/path/to/cert.pem",
						keyPath: "/path/to/key.pem",
					},
					discoveryUrls: ["http://localhost:8443"],
				} as unknown as AddressManagerConfig,
				healthChecker,
			});

			const result = await discovery.findService(
				"user-service" as unknown as ServiceInstanceName
			);
			expect(result).toBeDefined();
		});
	});

	describe("multi-instance region filtering", () => {
		test("should pick the healthy instance from preferred region", async () => {
			httpClient.get.mockResolvedValueOnce([usInstance, euInstance]);
			healthChecker.isHealthy.mockImplementation(
				async (inst) => inst.region === toRegion("us-east-1")
			);

			discovery = new ServiceDiscovery({
				httpClient,
				serviceCache: cache,
				config: {
					addressManagerUrl: "https://ds:3000",
					discoveryTimeoutMs: 5000,
					servicePort: Port.of(0),
					tokenRefreshIntervalMs: 0,
					ttlRefreshIntervalMs: 0,
					servicePingTimeoutMs: 0,
					cacheTtlMs: 0,
					identity: {
						serviceName: toServiceId("test-service"),
						instanceId: toInstanceId("test-instance"),
					},
					tls: {
						caPath: "/path/to/ca.pem",
						certPath: "/path/to/cert.pem",
						keyPath: "/path/to/key.pem",
					},
					discoveryUrls: ["http://localhost:8443"],
				} as unknown as AddressManagerConfig,
				healthChecker,
			});

			const result = await discovery.findServiceInRegion(
				"user-service" as unknown as ServiceInstanceName,
				toRegion("us-east-1")
			);
			expect(result.region).toBe("us-east-1");
		});
	});

	describe("no-region instances", () => {
		test("should handle instances without region field", async () => {
			httpClient.get.mockResolvedValueOnce([noRegionInstance]);
			healthChecker.isHealthy.mockResolvedValue(true);

			discovery = new ServiceDiscovery({
				httpClient,
				serviceCache: cache,
				config: {
					addressManagerUrl: "https://ds:3000",
					discoveryTimeoutMs: 5000,
					servicePort: Port.of(0),
					tokenRefreshIntervalMs: 0,
					ttlRefreshIntervalMs: 0,
					servicePingTimeoutMs: 0,
					cacheTtlMs: 0,
					identity: {
						serviceName: toServiceId("test-service"),
						instanceId: toInstanceId("test-instance"),
					},
					tls: {
						caPath: "/path/to/ca.pem",
						certPath: "/path/to/cert.pem",
						keyPath: "/path/to/key.pem",
					},
					discoveryUrls: ["http://localhost:8443"],
				} as unknown as AddressManagerConfig,
				healthChecker,
			});

			const result = await discovery.findService(
				"user-service" as unknown as ServiceInstanceName
			);
			expect(result.host).toBe("10.0.2.1");
		});
	});
});
