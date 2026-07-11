import { describe, expect, it } from "@jest/globals";
import {
	toHostPortAddress,
	toServiceIdentityKey,
} from "../../../src/domain/service-identity";

describe("toServiceIdentityKey", () => {
	it("should combine serviceName and instanceId with colon", () => {
		const key = toServiceIdentityKey({
			serviceName: "trader-service" as never,
			instanceId: "inst-001" as never,
		});
		expect(key).toBe("trader-service:inst-001");
	});

	it("should work with region present (region is not included in key)", () => {
		const key = toServiceIdentityKey({
			serviceName: "audit-logger" as never,
			instanceId: "node-42" as never,
			region: "us-east-1" as never,
		});
		expect(key).toBe("audit-logger:node-42");
	});
});

describe("toHostPortAddress", () => {
	it("should format host and port with colon", () => {
		const addr = toHostPortAddress({
			host: "192.168.1.1" as never,
			port: 8080 as never,
		});
		expect(addr).toBe("192.168.1.1:8080");
	});

	it("should work with IPv6 addresses", () => {
		const addr = toHostPortAddress({
			host: "::1" as never,
			port: 443 as never,
		});
		expect(addr).toBe("::1:443");
	});
});

describe("ServiceEndpoint", () => {
	it("should extend HostPort with serviceName", () => {
		const endpoint: Record<string, unknown> = {
			serviceName: "financial-scraper",
			host: "10.0.0.1",
			port: 3000,
		};
		expect(endpoint.serviceName).toBe("financial-scraper");
		expect(endpoint.host).toBe("10.0.0.1");
		expect(endpoint.port).toBe(3000);
	});
});
