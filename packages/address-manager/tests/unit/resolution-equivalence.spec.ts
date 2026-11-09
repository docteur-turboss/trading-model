import { describe, expect, it, jest } from "@jest/globals";

jest.mock("node:dns/promises", () => ({
	lookup: jest.fn(async (..._args: any[]) => ({
		address: "10.9.9.9",
		family: 4,
	})),
}));

import { EndpointResolver } from "../../src/application/discovery/endpoint-resolver";
import { ServiceResolver } from "../../src/application/discovery/service-resolver";

const inst = (version: string, port: number) => ({
	serviceName: "financial-scraper-service",
	instanceId: `i-${version}`,
	host: "10.0.0.1",
	port,
	version,
});

/** Legacy alias only; the wanted major version is NOT first (the old "first instance" path fails). */
const REGISTRY: Record<string, unknown[]> = {
	"financial-scraper-service": [inst("1.4.0", 3001), inst("2.0.0", 3002)],
};

describe("one resolution strategy (ADR-0045)", () => {
	it("AddressManager path and gateway path pick the same registered instance", async () => {
		const httpClient = {
			get: jest.fn(async (url: any) => {
				const name = String(url).split("/services/")[1];
				if (!REGISTRY[name]) {
					throw new Error("404");
				}
				return REGISTRY[name];
			}),
		};
		const config = {
			addressManagerUrl: "https://discovery:3000",
			cacheTtlMs: 1000,
			discoveryTimeoutMs: 1000,
		};
		const serviceResolver = new ServiceResolver({
			httpClient,
			config,
			serviceCache: {
				set: jest.fn<(...args: any[]) => any>(),
				delete: jest.fn<(...args: any[]) => any>(),
			},
			healthChecker: {
				locate: () => "financial-scraper",
				isHealthy: async () => true,
			},
		} as any);
		const gateway = new EndpointResolver(
			config.addressManagerUrl,
			1000,
			httpClient as any
		);

		const viaAddressManager = await serviceResolver.findService(
			"financial-scraper" as any,
			2
		);
		const viaGateway = await gateway.resolve("financial-scraper" as any, 2);

		expect(viaAddressManager.instanceId).toBe("i-2.0.0");
		expect(viaGateway?.port).toBe(viaAddressManager.port);
		expect(viaGateway?.version).toBe(viaAddressManager.version);
	});
});
