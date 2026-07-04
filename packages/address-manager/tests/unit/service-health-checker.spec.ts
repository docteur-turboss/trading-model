import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceInstance } from "../../src/client/type";
import {
	IdentityResolver,
	MapResolver,
} from "../../src/discovery/dns-resolver";
import { ServiceHealthChecker } from "../../src/discovery/service-health-checker";
import {
	IpAddressLocator,
	MappingServiceLocator,
} from "../../src/discovery/service-locator";

describe("ServiceHealthChecker", () => {
	let httpClient: jest.Mocked<HttpClient>;
	let checker: ServiceHealthChecker;

	const instance: ServiceInstance = {
		ip: "127.0.0.1",
		port: 8080,
		instanceId: "instance-1",
		lastHeartbeat: Date.now(),
		protocol: "http",
		registeredAt: Date.now(),
		serviceName: "user-service",
		version: "1.0.0",
		ttl: 30000,
	};

	beforeEach(() => {
		httpClient = {
			get: jest.fn(),
		} as unknown as jest.Mocked<HttpClient>;

		checker = new ServiceHealthChecker(httpClient, 2000);
	});

	test("returns true if the service responds successfully", async () => {
		httpClient.get.mockResolvedValueOnce({});

		const result = await checker.isHealthy(instance);

		expect(result).toBe(true);
		expect(httpClient.get).toHaveBeenCalledWith(
			"https://user-service:8080/ping",
			{
				timeoutMs: 2000,
			}
		);
	});

	test("returns false if the HTTP client throws an error", async () => {
		httpClient.get.mockRejectedValueOnce(new Error("Network error"));

		const result = await checker.isHealthy(instance);

		expect(result).toBe(false);
		expect(httpClient.get).toHaveBeenCalledWith(
			"https://user-service:8080/ping",
			{
				timeoutMs: 2000,
			}
		);
	});

	test("calls the HTTP client with the correct timeout", async () => {
		httpClient.get.mockResolvedValueOnce({});

		await checker.isHealthy(instance);

		expect(httpClient.get).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ timeoutMs: 2000 })
		);
	});

	test("uses ServiceNameLocator by default", () => {
		const url = (checker as any)._buildPingUrl(instance);
		expect(url).toBe("https://user-service:8080/ping");
	});

	test("IpAddressLocator uses instance.ip for URL construction", () => {
		checker = new ServiceHealthChecker(
			httpClient,
			2000,
			new IpAddressLocator()
		);
		const url = (checker as any)._buildPingUrl(instance);
		expect(url).toBe("https://127.0.0.1:8080/ping");
	});

	describe("DNS name mapping via MappingServiceLocator", () => {
		test("uses custom DNS mapping when provided", () => {
			const dnsMap = {
				"user-service": "custom-host",
				"other-service": "other-host",
			};
			checker = new ServiceHealthChecker(
				httpClient,
				2000,
				new MappingServiceLocator(new MapResolver(dnsMap))
			);

			const customInstance = { ...instance, serviceName: "user-service" };
			const url = (checker as any)._buildPingUrl(customInstance);
			expect(url).toBe("https://custom-host:8080/ping");
		});

		test("falls back to service name for unmapped services", () => {
			const dnsMap = { "other-service": "other-host" };
			checker = new ServiceHealthChecker(
				httpClient,
				2000,
				new MappingServiceLocator(new MapResolver(dnsMap))
			);

			const url = (checker as any)._buildPingUrl(instance);
			expect(url).toBe("https://user-service:8080/ping");
		});

		test("uses IdentityResolver fallback when no mapping resolver provided", () => {
			checker = new ServiceHealthChecker(
				httpClient,
				2000,
				new MappingServiceLocator(new IdentityResolver())
			);

			const url = (checker as any)._buildPingUrl(instance);
			expect(url).toBe("https://user-service:8080/ping");
		});

		test("uses mapped DNS name in actual health check request", async () => {
			const dnsMap = { "user-service": "discovery-server" };
			checker = new ServiceHealthChecker(
				httpClient,
				2000,
				new MappingServiceLocator(new MapResolver(dnsMap))
			);
			httpClient.get.mockResolvedValueOnce({});

			await checker.isHealthy(instance);

			expect(httpClient.get).toHaveBeenCalledWith(
				"https://discovery-server:8080/ping",
				{
					timeoutMs: 2000,
				}
			);
		});
	});
});
