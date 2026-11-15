import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { ServiceId } from "@trading-model/primitives/primitives";
import { EndpointResolver } from "../../src/discovery/endpoint-resolver";

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

describe("EndpointResolver.findInstance", () => {
	let resolver: EndpointResolver;
	let mockHttpClient: { get: jest.Mock<(...args: any[]) => any> };
	const find = (name: string, major?: number) =>
		resolver.findInstance(name as ServiceId, major);

	beforeEach(() => {
		mockHttpClient = {
			get: jest
				.fn<(...args: any[]) => any>()
				.mockImplementation(async () => [...MOCK_RESPONSE]),
		};
		resolver = new EndpointResolver(
			"https://discovery:3000",
			mockHttpClient as any
		);
	});

	it("should filter by major version, any when omitted", async () => {
		expect((await find("sector-allocator", 1))?.version).toBe("1.2.0");
		expect((await find("sector-allocator", 2))?.version).toBe("2.0.0");
		expect((await find("sector-allocator"))?.version).toBe("1.2.0");
		expect(await find("sector-allocator", 3)).toBeUndefined();
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

		expect((await find("financial-scraper", 1))?.host).toBe("10.0.3.1");
	});

	it("should answer discovery without asking it (it never registers)", async () => {
		expect(await find("discovery-server")).toEqual({ version: "1.0.0" });
		expect(mockHttpClient.get).not.toHaveBeenCalled();
	});

	it("should throw on a malformed registry answer, undefined on an empty one", async () => {
		mockHttpClient.get.mockImplementation(async () => ({ data: null }));
		await expect(find("sector-allocator", 1)).rejects.toThrow(
			"Malformed registry answer"
		);
		mockHttpClient.get.mockImplementation(async () => []);
		expect(await find("sector-allocator", 1)).toBeUndefined();
	});

	it("should throw when the registry cannot be reached", async () => {
		mockHttpClient.get.mockRejectedValue(new Error("ECONNREFUSED"));
		await expect(find("sector-allocator", 1)).rejects.toThrow("ECONNREFUSED");
	});

	it("should drop every trailing slash of the discovery URL", async () => {
		resolver = new EndpointResolver(
			"https://discovery:3000///",
			mockHttpClient as any
		);
		await find("sector-allocator", 1);
		expect(String(mockHttpClient.get.mock.calls[0][0])).toMatch(
			/^https:\/\/discovery:3000\/services\//
		);
	});

	it("should construct without httpClient (uses default)", () => {
		expect(new EndpointResolver("https://discovery:3000")).toBeInstanceOf(
			EndpointResolver
		);
	});
});
