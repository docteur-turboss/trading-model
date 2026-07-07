import { networkInterfaces } from "node:os";
import {
	afterAll,
	beforeEach,
	describe,
	expect,
	jest,
	test,
} from "@jest/globals";
import type { HttpClient } from "@trading-model/common/config/http-client";
import type { IPAddress, Port } from "@trading-model/common/domain/primitives";
import { AppError } from "@trading-model/common/utils/errors";
import { AddressManagerClient } from "../../src/client/address-manager-client";
import { LocalIPDetector } from "../../src/client/local-ip-detector";
import type { TokenManager } from "../../src/client/token-manager";
import type { ServiceRegistrationResponse } from "../../src/client/type";
import type { AddressManagerConfig } from "../../src/config/address-manager-config";

jest.mock("os");

describe("AddressManagerClient", () => {
	let httpClient: jest.Mocked<HttpClient>;
	let tokenManager: jest.Mocked<TokenManager>;
	let config: AddressManagerConfig;
	let client: AddressManagerClient;

	afterAll(() => {
		AddressManagerClient.resetLocalIP();
	});

	beforeEach(() => {
		AddressManagerClient.resetLocalIP();
		(networkInterfaces as jest.Mock).mockReturnValue({
			eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
		});
		LocalIPDetector.reset();

		httpClient = {
			get: jest.fn(),
			post: jest.fn(),
		} as unknown as jest.Mocked<HttpClient>;
		tokenManager = {
			getToken: jest.fn(),
		} as unknown as jest.Mocked<TokenManager>;
		tokenManager.getToken.mockReturnValue("mock-token");

		config = {
			addressManagerUrl: "http://localhost:8443",
			servicePort: 8080,
			tokenRefreshIntervalMs: 300_000,
			ttlRefreshIntervalMs: 300_000,
			servicePingTimeoutMs: 2000,
			cacheTtlMs: 60_000,
			identity: { serviceName: "test-service", instanceId: "test-instance" },
			tls: {
				caPath: "/path/to/ca.pem",
				certPath: "/path/to/cert.pem",
				keyPath: "/path/to/key.pem",
			},
			discoveryUrls: ["http://localhost:8443"],
			discoveryTimeoutMs: 5000,
		} as AddressManagerConfig;

		client = new AddressManagerClient(httpClient, tokenManager, config);
	});

	describe("unregisterService", () => {
		test("should call HttpClient.post with correct URL", async () => {
			httpClient.post.mockResolvedValueOnce(undefined);
			await client.unregisterService();
			expect(httpClient.post).toHaveBeenCalledWith(
				`${config.addressManagerUrl}/unregister`,
				{
					serviceName: config.identity.serviceName,
					instanceId: config.identity.instanceId,
				},
				{ headers: { "x-instance-token": "mock-token" } }
			);
		});

		test("should try next URL when first unregister fails", async () => {
			config = {
				...config,
				discoveryUrls: ["https://ds1:3000", "https://ds2:3000"],
			} as AddressManagerConfig;
			client = new AddressManagerClient(httpClient, tokenManager, config);

			httpClient.post
				.mockRejectedValueOnce(new Error("DS1 down"))
				.mockResolvedValueOnce(undefined);

			await client.unregisterService();

			expect(httpClient.post).toHaveBeenCalledWith(
				"https://ds2:3000/unregister",
				expect.any(Object),
				expect.any(Object)
			);
		});

		test("should not throw when all unregister URLs fail", async () => {
			config = {
				...config,
				discoveryUrls: ["https://ds1:3000", "https://ds2:3000"],
			} as AddressManagerConfig;
			client = new AddressManagerClient(httpClient, tokenManager, config);

			httpClient.post
				.mockRejectedValueOnce(new Error("DS1 down"))
				.mockRejectedValueOnce(new Error("DS2 down"));

			await expect(client.unregisterService()).resolves.toBeUndefined();
		});
	});

	describe("registerService", () => {
		test("should use cached IP on subsequent calls", async () => {
			(networkInterfaces as jest.Mock).mockReturnValue({
				eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
			});

			httpClient.post.mockResolvedValue({} as ServiceRegistrationResponse);

			await client.registerService();
			(networkInterfaces as jest.Mock).mockClear();

			await client.registerService();

			expect(networkInterfaces).not.toHaveBeenCalled();
		});

		test("should handle undefined network interface entries gracefully", async () => {
			(networkInterfaces as jest.Mock).mockReturnValueOnce({
				wlan0: undefined,
				eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
			});

			httpClient.post.mockResolvedValueOnce({} as ServiceRegistrationResponse);
			await client.registerService();

			expect(httpClient.post).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					ip: "192.168.1.100",
				})
			);
		});

		test("should fallback to 127.0.0.1 when no non-internal IPv4 interface exists", async () => {
			(networkInterfaces as jest.Mock).mockReturnValueOnce({
				lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
			});

			const response: ServiceRegistrationResponse = {
				host: "127.0.0.1" as unknown as IPAddress,
				port: 8080 as unknown as Port,
				instanceId: "instance-1",
				lastHeartbeat: Date.now(),
				protocol: "http",
				registeredAt: Date.now(),
				serviceName: "abc-service",
				token: "service-token",
				ttl: 30000,
				version: "1.0.0",
			};
			httpClient.post.mockResolvedValueOnce(response);

			const result = await client.registerService();

			expect(httpClient.post).toHaveBeenCalledWith(expect.any(String), {
				serviceName: config.identity.serviceName,
				port: config.servicePort,
				ip: expect.any(String),
			});
			expect(result).toEqual(response);
		});

		test("should call HttpClient.post with correct URL, payload, and headers", async () => {
			const response: ServiceRegistrationResponse = {
				host: "192.168.1.100" as unknown as IPAddress,
				port: 8080 as unknown as Port,
				instanceId: "instance-1",
				lastHeartbeat: Date.now(),
				protocol: "http",
				registeredAt: Date.now(),
				serviceName: "abc-service",
				token: "service-token",
				ttl: 30000,
				version: "1.0.0",
			};
			httpClient.post.mockResolvedValueOnce(response);

			const result = await client.registerService();

			expect(result).toEqual(response);
			expect(httpClient.post).toHaveBeenCalledWith(
				`${config.addressManagerUrl}/register`,
				{
					serviceName: config.identity.serviceName,
					port: config.servicePort,
					ip: "192.168.1.100",
				}
			);
		});

		test("should throw AddressManagerError preserving original cause when HttpClient.post fails", async () => {
			const error = new Error("Network failure");

			httpClient.post.mockRejectedValueOnce(error);
			const err = await client.registerService().catch((e) => e);
			expect(err).toBeInstanceOf(AppError);
			expect((err as AppError).cause).toBe(error);
		});
	});

	describe("refreshTTL", () => {
		test("should call HttpClient.post with correct URL and headers", async () => {
			httpClient.post.mockResolvedValueOnce(undefined);

			await client.refreshTTL();

			expect(httpClient.post).toHaveBeenCalledWith(
				`${config.addressManagerUrl}/heartbeat`,
				{
					serviceName: config.identity.serviceName,
					instanceId: config.identity.instanceId,
				},
				{ headers: { "x-instance-token": "mock-token" } }
			);
		});

		test("should throw AddressManagerError preserving original cause when HttpClient.post fails", async () => {
			const error = new Error("TTL refresh failed");

			httpClient.post.mockRejectedValueOnce(error);
			const err = await client.refreshTTL().catch((e) => e);
			expect(err).toBeInstanceOf(AppError);
			expect((err as AppError).cause).toBe(error);
		});

		test("should use discoveryUrls for concurrent TTL refresh when multiple URLs configured", async () => {
			config = {
				...config,
				discoveryUrls: ["https://ds1:3000", "https://ds2:3000"],
			} as AddressManagerConfig;
			client = new AddressManagerClient(httpClient, tokenManager, config);
			httpClient.post.mockResolvedValue(undefined);

			await client.refreshTTL();

			expect(httpClient.post).toHaveBeenCalledWith(
				"https://ds1:3000/heartbeat",
				expect.any(Object),
				expect.any(Object)
			);
			expect(httpClient.post).toHaveBeenCalledWith(
				"https://ds2:3000/heartbeat",
				expect.any(Object),
				expect.any(Object)
			);
		});

		test("should throw when all concurrent TTL refresh URLs fail", async () => {
			config = {
				...config,
				discoveryUrls: ["https://ds1:3000", "https://ds2:3000"],
			} as AddressManagerConfig;
			client = new AddressManagerClient(httpClient, tokenManager, config);

			httpClient.post
				.mockRejectedValueOnce(new Error("DS1 down"))
				.mockRejectedValueOnce(new Error("DS2 down"));

			await expect(client.refreshTTL()).rejects.toThrow(AppError);
		});

		test("should succeed when at least one concurrent TTL refresh URL succeeds", async () => {
			config = {
				...config,
				discoveryUrls: ["https://ds1:3000", "https://ds2:3000"],
			} as AddressManagerConfig;
			client = new AddressManagerClient(httpClient, tokenManager, config);

			httpClient.post
				.mockRejectedValueOnce(new Error("DS1 down"))
				.mockResolvedValueOnce(undefined);

			await expect(client.refreshTTL()).resolves.toBeUndefined();
		});
	});

	describe("hasIpChanged", () => {
		test("should return false on first call and cache IP", () => {
			(networkInterfaces as jest.Mock).mockReturnValue({
				eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
			});
			expect(client.hasIpChanged()).toBe(false);
		});

		test("should return false when IP has not changed", () => {
			(networkInterfaces as jest.Mock).mockReturnValue({
				eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
			});
			client.hasIpChanged();
			expect(client.hasIpChanged()).toBe(false);
		});

		test("should return true when IP has changed", () => {
			(networkInterfaces as jest.Mock).mockReturnValue({
				eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
			});
			client.hasIpChanged();
			(networkInterfaces as jest.Mock).mockReturnValue({
				eth0: [{ family: "IPv4", internal: false, address: "192.168.1.200" }],
			});
			expect(client.hasIpChanged()).toBe(true);
		});

		test("should return false when no non-internal IPv4 interface exists", () => {
			(networkInterfaces as jest.Mock).mockReturnValue({
				lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
			});
			expect(client.hasIpChanged()).toBe(false);
		});

		test("should handle undefined network interface entries gracefully", () => {
			(networkInterfaces as jest.Mock).mockReturnValue({
				wlan0: undefined,
			});
			expect(client.hasIpChanged()).toBe(false);
		});
	});
});
