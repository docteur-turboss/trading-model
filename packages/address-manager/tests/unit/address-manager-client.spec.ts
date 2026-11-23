import { networkInterfaces } from "node:os";
import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import { isAppError } from "@trading-model/common/utils/errors";
import { Protocol } from "@trading-model/contracts/service-registry-types";
import type { HttpClient } from "@trading-model/http/http-client";
import {
	DurationMs,
	InstanceId,
	IPAddress,
	Port,
	ServiceId,
	UnixTimestamp,
	type URLString,
	Version,
} from "@trading-model/primitives/primitives";
import { AddressManagerClient } from "../../src/client/address-manager-client";
import type { TokenManager } from "../../src/client/token-manager";
import type { ServiceRegistrationResponse } from "../../src/client/type";
import type { AddressManagerConfig } from "../../src/config/address-manager-config";
import { LocalIPDetector } from "../../src/shared/client/local-ip-detector";

jest.mock("os");

type MockHttp = Record<"get" | "post", jest.Mock<(...args: any[]) => any>>;

describe("AddressManagerClient", () => {
	let httpClient: MockHttp;
	let tokenManager: jest.Mocked<TokenManager>;
	let config: AddressManagerConfig;
	let client: AddressManagerClient;

	beforeEach(() => {
		(networkInterfaces as jest.Mock<(...args: any[]) => any>).mockReturnValue({
			eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
		});
		LocalIPDetector.reset();

		httpClient = {
			get: jest.fn<(...args: any[]) => any>(),
			post: jest.fn<(...args: any[]) => any>(),
		} as unknown as MockHttp;
		tokenManager = {
			getToken: jest.fn<(...args: any[]) => any>(),
			exclusive: (operation: () => Promise<unknown>) => operation(),
		} as unknown as jest.Mocked<TokenManager>;
		tokenManager.getToken.mockReturnValue("mock-token");

		config = {
			addressManagerUrl: "http://localhost:8443",
			servicePort: Port.of(8080),
			serviceVersion: "2.0.0",
			tokenRefreshIntervalMs: 300_000,
			ttlRefreshIntervalMs: 300_000,
			identity: {
				serviceName: ServiceId.of("api-gateway"),
				instanceId: InstanceId.of("test-instance"),
			},
			tls: {
				caPath: "/path/to/ca.pem",
				certPath: "/path/to/cert.pem",
				keyPath: "/path/to/key.pem",
			},
		} as AddressManagerConfig;

		client = new AddressManagerClient(
			httpClient as unknown as HttpClient,
			tokenManager,
			config
		);
	});

	describe("unregisterService", () => {
		test("should call HttpClient.post with correct URL", async () => {
			httpClient.post.mockResolvedValueOnce(undefined);
			await client.unregisterService();
			expect(httpClient.post).toHaveBeenCalledWith(
				`${config.addressManagerUrl}/unregister` as URLString,
				{
					serviceName: config.identity.serviceName,
					instanceId: config.identity.instanceId,
				},
				{
					headers: { "x-instance-token": "mock-token" },
					idempotent: true,
					serviceName: ServiceId.of("discovery-server"),
				}
			);
		});

		test("should not throw when unregister fails", async () => {
			httpClient.post.mockRejectedValueOnce(new Error("discovery down"));

			await expect(client.unregisterService()).resolves.toBeUndefined();
		});
	});

	describe("registerService", () => {
		test("should use cached IP on subsequent calls", async () => {
			(networkInterfaces as jest.Mock<(...args: any[]) => any>).mockReturnValue(
				{
					eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
				}
			);

			httpClient.post.mockResolvedValue({} as ServiceRegistrationResponse);

			await client.registerService();
			(networkInterfaces as jest.Mock<(...args: any[]) => any>).mockClear();

			await client.registerService();

			expect(networkInterfaces).not.toHaveBeenCalled();
		});

		test("should register under the instanceId used by heartbeats", async () => {
			httpClient.post.mockResolvedValueOnce({} as ServiceRegistrationResponse);

			await client.registerService();

			expect(httpClient.post).toHaveBeenCalledWith(
				expect.stringMatching(/\/register$/),
				expect.objectContaining({
					instanceId: config.identity.instanceId,
				}),
				{ idempotent: true, serviceName: ServiceId.of("discovery-server") },
				expect.anything()
			);
		});

		test("should handle undefined network interface entries gracefully", async () => {
			(
				networkInterfaces as jest.Mock<(...args: any[]) => any>
			).mockReturnValueOnce({
				wlan0: undefined,
				eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
			});

			httpClient.post.mockResolvedValueOnce({} as ServiceRegistrationResponse);
			await client.registerService();

			expect(httpClient.post).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					ip: "192.168.1.100",
				}),
				{ idempotent: true, serviceName: ServiceId.of("discovery-server") },
				expect.anything()
			);
		});

		test("should fallback to 127.0.0.1 when no non-internal IPv4 interface exists", async () => {
			(
				networkInterfaces as jest.Mock<(...args: any[]) => any>
			).mockReturnValueOnce({
				lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
			});

			const response: ServiceRegistrationResponse = {
				host: IPAddress.of("127.0.0.1"),
				port: Port.of(8080),
				instanceId: InstanceId.of("instance-1"),
				lastHeartbeat: UnixTimestamp.now(),
				protocol: Protocol.Http,
				registeredAt: UnixTimestamp.now(),
				serviceName: ServiceId.of("abc-service"),
				token: "service-token",
				ttl: DurationMs.of(30000),
				version: Version.of("1.0.0"),
			};
			httpClient.post.mockResolvedValueOnce(response);

			const result = await client.registerService();

			expect(httpClient.post).toHaveBeenCalledWith(
				expect.any(String),
				{
					serviceName: config.identity.serviceName,
					instanceId: config.identity.instanceId,
					port: config.servicePort,
					// The major routes the gateway prefix /v<major> to this instance.
					version: "2.0.0",
					ip: expect.any(String),
				},
				{ idempotent: true, serviceName: ServiceId.of("discovery-server") },
				expect.anything()
			);
			expect(result).toEqual(response);
		});

		test("should call HttpClient.post with correct URL, payload, and headers", async () => {
			const response: ServiceRegistrationResponse = {
				host: IPAddress.of("192.168.1.100"),
				port: Port.of(8080),
				instanceId: InstanceId.of("instance-1"),
				lastHeartbeat: UnixTimestamp.now(),
				protocol: Protocol.Http,
				registeredAt: UnixTimestamp.now(),
				serviceName: ServiceId.of("abc-service"),
				token: "service-token",
				ttl: DurationMs.of(30000),
				version: Version.of("1.0.0"),
			};
			httpClient.post.mockResolvedValueOnce(response);

			const result = await client.registerService();

			expect(result).toEqual(response);
			expect(httpClient.post).toHaveBeenCalledWith(
				`${config.addressManagerUrl}/register` as URLString,
				{
					serviceName: config.identity.serviceName,
					instanceId: config.identity.instanceId,
					port: config.servicePort,
					version: "2.0.0",
					ip: "192.168.1.100",
				},
				{ idempotent: true, serviceName: ServiceId.of("discovery-server") },
				expect.anything()
			);
		});

		test("should throw AddressManagerError preserving original cause when HttpClient.post fails", async () => {
			const error = new Error("Network failure");

			httpClient.post.mockRejectedValueOnce(error);
			const err = await client.registerService().catch((e) => e);
			expect(isAppError(err)).toBe(true);
			expect(err).toHaveProperty("cause", error);
		});
	});

	describe("refreshTTL", () => {
		test("should call HttpClient.post with correct URL and headers", async () => {
			httpClient.post.mockResolvedValueOnce(undefined);

			await client.refreshTTL();

			expect(httpClient.post).toHaveBeenCalledWith(
				`${config.addressManagerUrl}/heartbeat` as URLString,
				{
					serviceName: config.identity.serviceName,
					instanceId: config.identity.instanceId,
				},
				{
					headers: { "x-instance-token": "mock-token" },
					idempotent: true,
					serviceName: ServiceId.of("discovery-server"),
				}
			);
		});

		test("should throw AddressManagerError preserving original cause when HttpClient.post fails", async () => {
			const error = new Error("TTL refresh failed");

			httpClient.post.mockRejectedValueOnce(error);
			const err = await client.refreshTTL().catch((e) => e);
			expect(isAppError(err)).toBe(true);
			expect(err).toHaveProperty("cause", error);
		});
	});

	describe("hasIpChanged", () => {
		test("should return false on first call and cache IP", () => {
			(networkInterfaces as jest.Mock<(...args: any[]) => any>).mockReturnValue(
				{
					eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
				}
			);
			expect(client.hasIpChanged()).toBe(false);
		});

		test("should return false when IP has not changed", () => {
			(networkInterfaces as jest.Mock<(...args: any[]) => any>).mockReturnValue(
				{
					eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
				}
			);
			client.hasIpChanged();
			expect(client.hasIpChanged()).toBe(false);
		});

		test("should return true when IP has changed", () => {
			(networkInterfaces as jest.Mock<(...args: any[]) => any>).mockReturnValue(
				{
					eth0: [{ family: "IPv4", internal: false, address: "192.168.1.100" }],
				}
			);
			client.hasIpChanged();
			(networkInterfaces as jest.Mock<(...args: any[]) => any>).mockReturnValue(
				{
					eth0: [{ family: "IPv4", internal: false, address: "192.168.1.200" }],
				}
			);
			expect(client.hasIpChanged()).toBe(true);
		});

		test("should return false when no non-internal IPv4 interface exists", () => {
			(networkInterfaces as jest.Mock<(...args: any[]) => any>).mockReturnValue(
				{
					lo: [{ family: "IPv4", internal: true, address: "127.0.0.1" }],
				}
			);
			expect(client.hasIpChanged()).toBe(false);
		});

		test("should handle undefined network interface entries gracefully", () => {
			(networkInterfaces as jest.Mock<(...args: any[]) => any>).mockReturnValue(
				{
					wlan0: undefined,
				}
			);
			expect(client.hasIpChanged()).toBe(false);
		});
	});
});
