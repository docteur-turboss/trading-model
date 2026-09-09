import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { HttpClient } from "@trading-model/common/config/http-client";
import type { URLString } from "@trading-model/common/domain/primitives";
import { TokenManager } from "../../src/application/client/token-manager";
import type { AddressManagerConfig } from "../../src/domain/config/address-manager-config";

describe("TokenManager", () => {
	let httpClient: jest.Mocked<HttpClient>;
	let config: AddressManagerConfig;
	let manager: TokenManager;

	beforeEach(() => {
		httpClient = { post: jest.fn() } as unknown as jest.Mocked<HttpClient>;

		config = {
			addressManagerUrl: "http://localhost:8443",
			servicePort: 8080,
			tokenRefreshIntervalMs: 300_000,
			ttlRefreshIntervalMs: 300_000,
			servicePingTimeoutMs: 2000,
			cacheTtlMs: 60_000,
			identity: { serviceName: "test-service", instanceId: "instance-1" },
			tls: {
				caPath: "/path/to/ca.pem",
				certPath: "/path/to/cert.pem",
				keyPath: "/path/to/key.pem",
			},
			discoveryUrls: ["http://localhost:8443"],
			discoveryTimeoutMs: 5000,
		} as AddressManagerConfig;

		manager = new TokenManager(httpClient, config);
	});

	describe("getToken", () => {
		test("should throw AuthenticationError if token is not available", () => {
			expect(() => manager.getToken()).toThrow(Error);
			expect(() => manager.getToken()).toThrow(
				"Token is not available. Did you call refreshToken()?"
			);
		});

		test("should return the token after successful refresh", async () => {
			const mockToken = "abc123";
			httpClient.post.mockResolvedValueOnce({ token: mockToken });
			manager.setToken("initial-token");

			await manager.refreshToken();

			const token = manager.getToken();
			expect(token).toBe(mockToken);
		});
	});

	describe("setToken", () => {
		test("should set the token and make it available via getToken", () => {
			manager.setToken("direct-token");
			expect(manager.getToken()).toBe("direct-token");
		});
	});

	describe("clearToken", () => {
		test("should clear the stored token", () => {
			manager.setToken("some-token");
			manager.clearToken();
			expect(manager.getTokenOrUndefined()).toBeUndefined();
		});
	});

	describe("refreshToken", () => {
		test("should call HttpClient.post with correct URL and payload", async () => {
			const mockToken = "rotated-token";
			httpClient.post.mockResolvedValueOnce({ token: mockToken });
			manager.setToken("initial-token");

			await manager.refreshToken();

			expect(httpClient.post).toHaveBeenCalledWith(
				`${config.addressManagerUrl}/token/rotate` as URLString,
				{
					instanceId: config.identity.instanceId,
					serviceName: config.identity.serviceName,
				},
				{
					headers: { "x-instance-token": "initial-token" },
				}
			);

			expect(manager.getToken()).toBe(mockToken);
		});

		test("should refresh token without x-instance-token header when no initial token", async () => {
			const mockToken = "new-token";
			httpClient.post.mockResolvedValueOnce({ token: mockToken });

			await manager.refreshToken();

			expect(httpClient.post).toHaveBeenCalledWith(
				`${config.addressManagerUrl}/token/rotate` as URLString,
				{
					instanceId: config.identity.instanceId,
					serviceName: config.identity.serviceName,
				},
				{ headers: {} }
			);
			expect(manager.getToken()).toBe(mockToken);
		});

		test("should throw AuthenticationError if response is missing token", async () => {
			httpClient.post.mockResolvedValueOnce({});
			manager.setToken("initial-token");

			await expect(manager.refreshToken()).rejects.toThrow(Error);
			await expect(manager.refreshToken()).rejects.toThrow(
				"Invalid token response from Address Manager"
			);
		});

		test("should throw AuthenticationError if HttpClient.post throws", async () => {
			const error = new Error("Network failure");
			httpClient.post.mockRejectedValueOnce(error);
			manager.setToken("initial-token");
			await expect(manager.refreshToken()).rejects.toThrow(Error);

			httpClient.post.mockRejectedValueOnce(error);
			manager.setToken("initial-token");
			await expect(manager.refreshToken()).rejects.toMatchObject({
				message: "Failed to refresh authentication token",
			});
		});
	});
});
