import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { HttpClient } from "@trading-model/common/config/http-client";
import { Protocol } from "@trading-model/common/contracts/service-registry.types";
import {
	IPAddress,
	Port,
	toInstanceId,
	toServiceId,
	toVersion,
} from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../../src/client/type";
import { ServiceHealthChecker } from "../../src/discovery/service-health-checker";
import { IpAddressLocator } from "../../src/discovery/service-locator";

describe("ServiceHealthChecker", () => {
	let httpClient: jest.Mocked<HttpClient>;
	let checker: ServiceHealthChecker;

	const instance: ServiceInstance = {
		host: IPAddress.of("127.0.0.1"),
		port: Port.of(8080),
		instanceId: toInstanceId("instance-1"),
		lastHeartbeat: Date.now(),
		protocol: Protocol.Http,
		registeredAt: Date.now(),
		serviceName: toServiceId("user-service"),
		version: toVersion("1.0.0"),
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
});
