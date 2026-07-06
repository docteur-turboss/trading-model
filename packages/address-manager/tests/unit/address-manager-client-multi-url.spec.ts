import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { HttpClient } from "@trading-model/common/config/http-client";
import { AddressManagerClient } from "../../src/client/address-manager-client";
import type { TokenManager } from "../../src/client/token-manager";
import type { AddressManagerConfig } from "../../src/config/address-manager-config";

describe("AddressManagerClient Multi-URL", () => {
	let client: AddressManagerClient;
	let httpClient: jest.Mocked<HttpClient>;
	let tokenManager: jest.Mocked<TokenManager>;

	function makeConfig(
		overrides?: Partial<AddressManagerConfig>
	): AddressManagerConfig {
		return {
			instanceId: "test-instance",
			serviceName: "test-service",
			servicePort: 8080,
			addressManagerUrl: "https://ds-primary:3000",
			discoveryUrls: ["https://ds-primary:3000", "https://ds-secondary:3000"],
			cacheTtlMs: 30000,
			discoveryTimeoutMs: 5000,
			servicePingTimeoutMs: 2000,
			tokenRefreshIntervalMs: 60000,
			ttlRefreshIntervalMs: 15000,
			caPath: "/certs/ca.crt",
			certPath: "/certs/server.crt",
			keyPath: "/certs/server.key",
			...overrides,
		};
	}

	function createMockHttpClient(): jest.Mocked<HttpClient> {
		return {
			post: jest
				.fn<(url: string) => Promise<unknown>>()
				.mockResolvedValue(undefined),
			get: jest
				.fn<(url: string) => Promise<unknown>>()
				.mockResolvedValue(undefined),
			delete: jest
				.fn<(url: string) => Promise<unknown>>()
				.mockResolvedValue(undefined),
		} as unknown as jest.Mocked<HttpClient>;
	}

	function createMockTokenManager(): jest.Mocked<TokenManager> {
		return {
			getToken: jest.fn<() => string>().mockReturnValue("test-token"),
			setToken: jest.fn<(t: string) => void>(),
			clearToken: jest.fn<() => void>(),
			refreshToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		} as unknown as jest.Mocked<TokenManager>;
	}

	beforeEach(() => {
		httpClient = createMockHttpClient();
		tokenManager = createMockTokenManager();
		AddressManagerClient.resetLocalIP();
	});

	test("should try primary URL first and succeed", async () => {
		const config = makeConfig();
		httpClient.post.mockResolvedValueOnce({
			token: "new-token",
			instanceId: "test-instance",
		});

		client = new AddressManagerClient(httpClient, tokenManager, config);
		const result = await client.registerService();

		expect(httpClient.post).toHaveBeenCalledWith(
			"https://ds-primary:3000/register",
			expect.any(Object)
		);
		expect(result).toBeDefined();
	});

	test("should fall back to secondary URL when primary fails", async () => {
		const config = makeConfig();
		httpClient.post
			.mockRejectedValueOnce(new Error("Primary unreachable"))
			.mockResolvedValueOnce({
				token: "new-token",
				instanceId: "test-instance",
			});

		client = new AddressManagerClient(httpClient, tokenManager, config);
		const result = await client.registerService();

		expect(httpClient.post).toHaveBeenCalledWith(
			"https://ds-secondary:3000/register",
			expect.any(Object)
		);
		expect(result).toBeDefined();
	});

	test("should throw when all URLs fail", async () => {
		const config = makeConfig();
		httpClient.post
			.mockRejectedValueOnce(new Error("Primary down"))
			.mockRejectedValueOnce(new Error("Secondary down"));

		client = new AddressManagerClient(httpClient, tokenManager, config);
		await expect(client.registerService()).rejects.toThrow();
	});

	test("should call all URLs concurrently for TTL refresh", async () => {
		const config = makeConfig();
		httpClient.post.mockResolvedValue(undefined);

		client = new AddressManagerClient(httpClient, tokenManager, config);
		await client.refreshTTL();

		// With concurrent mode, both URLs are called in parallel
		const calls = (httpClient.post as jest.Mock).mock.calls;
		const calledUrls = calls.map((c: unknown[]) => c[0]);
		expect(calledUrls).toContain("https://ds-primary:3000/heartbeat");
		expect(calledUrls).toContain("https://ds-secondary:3000/heartbeat");
	});

	test("should use single URL when discoveryUrls has one entry", async () => {
		const config = makeConfig({ discoveryUrls: ["https://ds-only:3000"] });
		httpClient.post.mockResolvedValueOnce({
			token: "new-token",
			instanceId: "test-instance",
		});

		client = new AddressManagerClient(httpClient, tokenManager, config);
		await client.registerService();

		expect(httpClient.post).toHaveBeenCalledWith(
			"https://ds-only:3000/register",
			expect.any(Object)
		);
	});
});
