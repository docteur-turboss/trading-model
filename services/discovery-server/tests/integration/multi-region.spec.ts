import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Protocol } from "@trading-model/contracts/service-registry-types";
import type {
	DurationMs,
	InstanceId,
	IPAddress,
	Port,
	Region,
	ServiceId,
	UnixTimestamp,
	Version,
} from "@trading-model/primitives/primitives";
import type { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { createServiceRegistry } from "../../src/config/container";
import type { ServiceRegistry } from "../../src/domain/service-registry";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

describe("Multi-Region Support", () => {
	let registry: ServiceRegistry;

	beforeEach(() => {
		registry = createServiceRegistry();
	});

	it("should register instances in different regions", async () => {
		await registry.registerInstance({
			serviceName: "financial-scraper-service" as ServiceId,
			instanceId: "node-us" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			region: "us-east-1" as Region,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		await registry.registerInstance({
			serviceName: "financial-scraper-service" as ServiceId,
			instanceId: "node-eu" as InstanceId,
			host: "10.0.1.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			region: "eu-west-1" as Region,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		const allInstances = await registry.instanceStore.getInstances(
			"financial-scraper-service" as unknown as ServiceInstanceName
		);
		expect(allInstances).toHaveLength(2);

		const usInstances = allInstances.filter((i) => i.region === "us-east-1");
		const euInstances = allInstances.filter((i) => i.region === "eu-west-1");
		expect(usInstances).toHaveLength(1);
		expect(euInstances).toHaveLength(1);
	});

	it("should handle region-unspecified instances", async () => {
		await registry.registerInstance({
			serviceName: "financial-scraper-service" as ServiceId,
			instanceId: "node-legacy" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		const instances = await registry.instanceStore.getInstances(
			"financial-scraper-service" as unknown as ServiceInstanceName
		);
		expect(instances[0].region).toBeUndefined();
	});

	it("should preserve region across heartbeat updates", async () => {
		await registry.registerInstance({
			serviceName: "financial-scraper-service" as ServiceId,
			instanceId: "node-us" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			region: "us-east-1" as Region,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		await registry.instanceStore.updateHeartbeat({
			serviceName: "financial-scraper-service" as ServiceId,
			instanceId: "node-us" as InstanceId,
		});

		const instance = await registry.instanceStore.getInstance({
			serviceName: "financial-scraper-service" as ServiceId,
			instanceId: "node-us" as InstanceId,
		});
		expect(instance?.region).toBe("us-east-1");
	});

	it("should allow updating region on re-registration", async () => {
		await registry.registerInstance({
			serviceName: "financial-scraper-service" as ServiceId,
			instanceId: "node-1" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			region: "us-east-1" as Region,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		await registry.registerInstance({
			serviceName: "financial-scraper-service" as ServiceId,
			instanceId: "node-1" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			region: "eu-west-1" as Region,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		const instance = await registry.instanceStore.getInstance({
			serviceName: "financial-scraper-service" as ServiceId,
			instanceId: "node-1" as InstanceId,
		});
		expect(instance?.region).toBe("eu-west-1");
	});
});
