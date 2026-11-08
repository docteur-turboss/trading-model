import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type { ServiceId } from "@trading-model/primitives/primitives";

jest.mock("node:dns/promises", () => ({
	lookup: jest.fn(async (name: string) => ({
		address: name === "discovery" ? "172.25.0.2" : "10.9.9.9",
		family: 4,
	})),
}));

import { lookup } from "node:dns/promises";
import {
	isAllowedProxyIP,
	parseCIDRList,
} from "@trading-model/primitives/primitives";
import { EndpointResolver } from "../../src/application/discovery/endpoint-resolver";

const makeInstance = (host: string, port: number, version: string) => ({
	serviceName: "sector-allocator",
	instanceId: `inst-${host}`,
	host,
	port,
	version,
	ttl: 30_000,
	protocol: "mtls",
	registeredAt: 1000,
	lastHeartbeat: 1500,
});

const MOCK_RESPONSE = [
	makeInstance("10.0.1.5", 3000, "1.2.0"),
	makeInstance("10.0.1.6", 3000, "1.3.0"),
	makeInstance("10.0.2.1", 3000, "2.0.0"),
];

describe("EndpointResolver", () => {
	let resolver: EndpointResolver;
	let mockHttpClient: { get: jest.Mock<(...args: any[]) => any> };

	beforeEach(() => {
		jest.useFakeTimers();
		mockHttpClient = {
			get: jest
				.fn<(...args: any[]) => any>()
				.mockImplementation(async () => [...MOCK_RESPONSE]),
		};
		resolver = new EndpointResolver(
			"https://discovery:3000",
			5000,
			mockHttpClient as any
		);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should resolve a service by name and major version", async () => {
		const target = await resolver.resolve("sector-allocator" as ServiceId, 1);
		expect(target).not.toBeNull();
		expect(target!.version).toMatch(/^1\./);
		expect(target!.host).toBeDefined();
		expect(target!.port).toBeDefined();
	});

	it("should filter by major version", async () => {
		const v1 = await resolver.resolve("sector-allocator" as ServiceId, 1);
		expect(v1).not.toBeNull();
		expect(v1!.version.startsWith("1.")).toBe(true);

		const v2 = await resolver.resolve("sector-allocator" as ServiceId, 2);
		expect(v2).not.toBeNull();
		expect(v2!.version.startsWith("2.")).toBe(true);
	});

	it("should return null when no instances match the version", async () => {
		const target = await resolver.resolve("sector-allocator" as ServiceId, 3);
		expect(target).toBeNull();
	});

	it("should find a service registered under its legacy name", async () => {
		mockHttpClient.get.mockImplementation(async (url: unknown) => {
			if (String(url).endsWith("/financial-scraper")) {
				throw new Error("404 Unknown service");
			}
			return String(url).endsWith("/financial-scraper-service")
				? [makeInstance("10.0.3.1", 3000, "1.0.0")]
				: [];
		});

		const target = await resolver.resolve("financial-scraper" as never, 1);

		expect(target?.host).toBe("10.9.9.9");
	});

	it("should find a service registered under its canonical name", async () => {
		mockHttpClient.get.mockImplementation(async (url: unknown) =>
			String(url).endsWith("/financial-scraper")
				? [makeInstance("10.0.3.2", 3000, "1.0.0")]
				: []
		);

		const target = await resolver.resolve("financial-scraper" as never, 1);

		expect(target?.host).toBe("10.9.9.9");
	});

	it("should reach discovery at its configured URL (it never registers)", async () => {
		const target = await resolver.resolve("discovery-server" as never, 1);

		expect(target).toMatchObject({ host: "172.25.0.2", port: 3000 });
		expect(mockHttpClient.get).not.toHaveBeenCalled();
	});

	it("should return null for unknown service", async () => {
		mockHttpClient.get.mockImplementation(async () => []);
		const target = await resolver.resolve("unknown-service" as ServiceId, 1);
		expect(target).toBeNull();
	});

	it("should cache resolved instances within TTL", async () => {
		await resolver.resolve("sector-allocator" as ServiceId, 1);
		await resolver.resolve("sector-allocator" as ServiceId, 1);

		expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
	});

	it("should re-fetch after cache expires", async () => {
		await resolver.resolve("sector-allocator" as ServiceId, 1);

		jest.advanceTimersByTime(6000);

		await resolver.resolve("sector-allocator" as ServiceId, 1);
		expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
	});

	it("should target the platform DNS address, never the registered IP", async () => {
		const target = await resolver.resolve("sector-allocator" as ServiceId, 1);

		expect(target).toMatchObject({ host: "10.9.9.9", port: 3000 });
		expect(lookup).toHaveBeenCalledWith("sector-allocator", { family: 4 });
	});

	// The gateway checks the host against ALLOWED_PROXY_CIDRS: it must be an IP.
	it("should return an IPv4 host the CIDR allowlist can check", async () => {
		const target = await resolver.resolve("sector-allocator" as ServiceId, 1);

		expect(isAllowedProxyIP(target!.host, parseCIDRList("10.9.0.0/16"))).toBe(
			true
		);
		expect(
			isAllowedProxyIP(target!.host, parseCIDRList("192.168.0.0/16"))
		).toBe(false);
	});

	it("should return stale cached data when discovery is unreachable", async () => {
		await resolver.resolve("sector-allocator" as ServiceId, 1);

		jest.advanceTimersByTime(6000);

		mockHttpClient.get.mockRejectedValue(new Error("Connection refused"));

		const target = await resolver.resolve("sector-allocator" as ServiceId, 1);
		expect(target).not.toBeNull();
	});

	it("should invalidate cache for a specific service", async () => {
		await resolver.resolve("sector-allocator" as ServiceId, 1);
		resolver.invalidateCache("sector-allocator");

		await resolver.resolve("sector-allocator" as ServiceId, 1);
		expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
	});

	it("should invalidate entire cache", async () => {
		await resolver.resolve("sector-allocator" as ServiceId, 1);
		resolver.invalidateCache();

		await resolver.resolve("sector-allocator" as ServiceId, 1);
		expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
	});

	it("should return null from handleFallback when cache is empty", async () => {
		mockHttpClient.get.mockRejectedValue(new Error("Connection refused"));

		const target = await resolver.resolve("fresh-service" as ServiceId, 1);
		expect(target).toBeNull();
	});

	it("should handle non-array discovery response", async () => {
		mockHttpClient.get.mockImplementation(async () => ({ data: null }));

		const target = await resolver.resolve("sector-allocator" as ServiceId, 1);
		expect(target).toBeNull();
	});

	it("should return null when discovery returns empty array (no stale)", async () => {
		await resolver.resolve("sector-allocator" as ServiceId, 1);

		jest.advanceTimersByTime(6000);

		mockHttpClient.get.mockImplementation(async () => []);

		const target = await resolver.resolve("sector-allocator" as ServiceId, 1);
		expect(target).toBeNull();
	});

	it("should handle empty cached instances expiry correctly", async () => {
		mockHttpClient.get.mockImplementation(async () => []);

		const first = await resolver.resolve("new-service" as ServiceId, 1);
		expect(first).toBeNull();

		jest.advanceTimersByTime(6000);

		const second = await resolver.resolve("new-service" as ServiceId, 1);
		expect(second).toBeNull();
	});

	it("should return null from cache when cached instances are empty within TTL", async () => {
		mockHttpClient.get.mockImplementation(async () => []);

		const first = await resolver.resolve("cache-empty-service" as ServiceId, 1);
		expect(first).toBeNull();

		const second = await resolver.resolve(
			"cache-empty-service" as ServiceId,
			1
		);
		expect(second).toBeNull();

		expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
	});

	it("should construct without httpClient (uses default)", () => {
		const r = new EndpointResolver("https://discovery:3000", 5000);
		expect(r).toBeInstanceOf(EndpointResolver);
	});

	it("should drop every trailing slash of the discovery URL", async () => {
		const r = new EndpointResolver(
			"https://discovery:3000///",
			5000,
			mockHttpClient as any
		);
		await r.resolve("sector-allocator" as ServiceId, 1);
		expect(String(mockHttpClient.get.mock.calls[0][0])).toMatch(
			/^https:\/\/discovery:3000\/services\//
		);
	});

	it("should share one discovery lookup between concurrent calls on a key", async () => {
		const targets = await Promise.all(
			Array.from({ length: 50 }, () =>
				resolver.resolve("sector-allocator" as ServiceId, 1)
			)
		);

		expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
		expect(new Set(targets.map((t) => t?.host)).size).toBe(1);
		expect(targets[0]).not.toBeNull();
	});

	it("should drop a failed lookup, retry on the next call and keep the stale fallback", async () => {
		await resolver.resolve("sector-allocator" as ServiceId, 1);
		jest.advanceTimersByTime(6000);
		mockHttpClient.get.mockRejectedValue(new Error("Connection refused"));

		const [a, b] = await Promise.all([
			resolver.resolve("sector-allocator" as ServiceId, 1),
			resolver.resolve("sector-allocator" as ServiceId, 1),
		]);
		expect(a).not.toBeNull();
		expect(b).toEqual(a);
		expect(mockHttpClient.get).toHaveBeenCalledTimes(2);

		mockHttpClient.get.mockImplementation(async () => [...MOCK_RESPONSE]);
		await resolver.resolve("sector-allocator" as ServiceId, 1);
		expect(mockHttpClient.get).toHaveBeenCalledTimes(3);
	});

	it("should drop a lookup that throws outside the registry call", async () => {
		(
			lookup as unknown as jest.Mock<(...args: any[]) => any>
		).mockRejectedValueOnce(new Error("dns down"));
		await expect(
			resolver.resolve("sector-allocator" as ServiceId, 1)
		).rejects.toThrow("dns down");

		await expect(
			resolver.resolve("sector-allocator" as ServiceId, 1)
		).resolves.not.toBeNull();
	});

	it("should invalidate cache only for matching service key", async () => {
		await resolver.resolve("sector-allocator" as ServiceId, 1);
		await resolver.resolve("other-service" as ServiceId, 2);

		resolver.invalidateCache("sector-allocator");

		const cached = await resolver.resolve("other-service" as ServiceId, 2);
		expect(cached).not.toBeNull();

		expect(mockHttpClient.get).toHaveBeenCalledTimes(2);
	});
});
