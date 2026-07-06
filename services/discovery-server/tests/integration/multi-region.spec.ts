import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ServiceRegistry } from "../../src/core/service-registry";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("Multi-Region Support", () => {
	let registry: ServiceRegistry;

	beforeEach(() => {
		registry = new ServiceRegistry();
	});

	it("should register instances in different regions", () => {
		registry.registerInstance({
			serviceName: "financial-scraper-service",
			instanceId: "node-us",
			ip: "10.0.0.1",
			port: 8444,
			ttl: 30_000,
			protocol: "mtls",
			version: "1.0.0",
			region: "us-east-1",
			registeredAt: Date.now(),
			lastHeartbeat: Date.now(),
		});

		registry.registerInstance({
			serviceName: "financial-scraper-service",
			instanceId: "node-eu",
			ip: "10.0.1.1",
			port: 8444,
			ttl: 30_000,
			protocol: "mtls",
			version: "1.0.0",
			region: "eu-west-1",
			registeredAt: Date.now(),
			lastHeartbeat: Date.now(),
		});

		const allInstances = registry.getInstances("financial-scraper-service");
		expect(allInstances).toHaveLength(2);

		const usInstances = allInstances.filter((i) => i.region === "us-east-1");
		const euInstances = allInstances.filter((i) => i.region === "eu-west-1");
		expect(usInstances).toHaveLength(1);
		expect(euInstances).toHaveLength(1);
	});

	it("should handle region-unspecified instances", () => {
		registry.registerInstance({
			serviceName: "financial-scraper-service",
			instanceId: "node-legacy",
			ip: "10.0.0.1",
			port: 8444,
			ttl: 30_000,
			protocol: "mtls",
			version: "1.0.0",
			registeredAt: Date.now(),
			lastHeartbeat: Date.now(),
		});

		const instances = registry.getInstances("financial-scraper-service");
		expect(instances[0].region).toBeUndefined();
	});

	it("should preserve region across heartbeat updates", () => {
		registry.registerInstance({
			serviceName: "financial-scraper-service",
			instanceId: "node-us",
			ip: "10.0.0.1",
			port: 8444,
			ttl: 30_000,
			protocol: "mtls",
			version: "1.0.0",
			region: "us-east-1",
			registeredAt: Date.now(),
			lastHeartbeat: Date.now(),
		});

		registry.updateHeartbeat({ serviceName: "financial-scraper-service", instanceId: "node-us" });

const instance = registry.getInstance(
			{ serviceName: "financial-scraper-service", instanceId: "node-us" }
		);
		expect(instance?.region).toBe("us-east-1");
	});

	it("should allow updating region on re-registration", () => {
		registry.registerInstance({
			serviceName: "financial-scraper-service",
			instanceId: "node-1",
			ip: "10.0.0.1",
			port: 8444,
			ttl: 30_000,
			protocol: "mtls",
			version: "1.0.0",
			region: "us-east-1",
			registeredAt: Date.now(),
			lastHeartbeat: Date.now(),
		});

		registry.registerInstance({
			serviceName: "financial-scraper-service",
			instanceId: "node-1",
			ip: "10.0.0.1",
			port: 8444,
			ttl: 30_000,
			protocol: "mtls",
			version: "1.0.0",
			region: "eu-west-1",
			registeredAt: Date.now(),
			lastHeartbeat: Date.now(),
		});

const instance = registry.getInstance(
			{ serviceName: "financial-scraper-service", instanceId: "node-1" }
		);
		expect(instance?.region).toBe("eu-west-1");
	});
});

