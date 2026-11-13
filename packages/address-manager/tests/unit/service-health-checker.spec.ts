import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { Protocol } from "@trading-model/contracts/service-registry-types";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import {
	DurationMs,
	IPAddress,
	Port,
	toInstanceId,
	toServiceId,
	toVersion,
	UnixTimestamp,
	URLString,
} from "@trading-model/primitives/primitives";
import { ServiceHealthChecker } from "../../src/adapters/outbound/discovery/service-health-checker";
import type { ServiceInstance } from "../../src/domain/client/type";

type MockHttp = Record<"get" | "post", jest.Mock<(...args: any[]) => any>>;

describe("ServiceHealthChecker", () => {
	let httpClient: MockHttp;
	let checker: ServiceHealthChecker;

	const instance: ServiceInstance = {
		host: IPAddress.of("127.0.0.1"),
		port: Port.of(8080),
		instanceId: toInstanceId("instance-1"),
		lastHeartbeat: UnixTimestamp.now(),
		protocol: Protocol.Http,
		registeredAt: UnixTimestamp.now(),
		serviceName: toServiceId("user-service"),
		version: toVersion("1.0.0"),
		ttl: DurationMs.of(30000),
	};

	beforeEach(() => {
		httpClient = {
			get: jest.fn<(...args: any[]) => any>(),
		} as unknown as MockHttp;

		checker = new ServiceHealthChecker({
			httpClient: httpClient as unknown as HttpClient,
			timeoutMs: DurationMs.of(2000),
		});
	});

	test("returns true if the service responds successfully", async () => {
		httpClient.get.mockResolvedValueOnce({});

		const result = await checker.isHealthy(instance);

		expect(result).toBe(true);
		expect(httpClient.get).toHaveBeenCalledWith(
			URLString.of("https://user-service:8080/ping"),
			{
				timeoutMs: DurationMs.of(2000),
			}
		);
	});

	test("returns false if the HTTP client throws an error", async () => {
		httpClient.get.mockRejectedValueOnce(new Error("Network error"));

		const result = await checker.isHealthy(instance);

		expect(result).toBe(false);
		expect(httpClient.get).toHaveBeenCalledWith(
			URLString.of("https://user-service:8080/ping"),
			{
				timeoutMs: DurationMs.of(2000),
			}
		);
	});

	test("calls the HTTP client with the correct timeout", async () => {
		httpClient.get.mockResolvedValueOnce({});

		await checker.isHealthy(instance);

		expect(httpClient.get).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ timeoutMs: DurationMs.of(2000) })
		);
	});

	test("uses ServiceNameLocator by default", () => {
		const url = (checker as any)._buildPingUrl(instance);
		expect(url).toBe("https://user-service:8080/ping");
	});

	test("a host-based locator uses instance.host for URL construction", () => {
		checker = new ServiceHealthChecker({
			httpClient: httpClient as unknown as HttpClient,
			timeoutMs: DurationMs.of(2000),
			serviceLocator: {
				locate: (target) => target.host,
				resolve: (name) => name,
			},
		});
		const url = (checker as any)._buildPingUrl(instance);
		expect(url).toBe("https://127.0.0.1:8080/ping");
	});

	test("constructor defaults to ServiceNameLocator when no serviceLocator provided", () => {
		const defaultChecker = new ServiceHealthChecker({
			httpClient: httpClient as unknown as HttpClient,
			timeoutMs: DurationMs.of(2000),
		});
		const url = (defaultChecker as any)._buildPingUrl(instance);
		expect(url).toBe("https://user-service:8080/ping");
	});
});
