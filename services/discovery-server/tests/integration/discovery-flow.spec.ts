import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Protocol } from "@trading-model/contracts/service-registry-types";
import type {
	AuthToken,
	DurationMs,
	InstanceId,
	IPAddress,
	Port,
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

jest.mock("../../src/infrastructure/config/env", () => ({
	env: {
		CLEANUP_SERVICE_INTERVAL_MS: 5000,
		ERROR_URL_WEBHOOK: "https://hooks.example.com/error",
	},
}));

describe("Discovery Service — Full Flow Integration", () => {
	let registry: ServiceRegistry;

	beforeEach(() => {
		jest.clearAllMocks();
		registry = createServiceRegistry();
	});

	it("should register an instance and find it via getInstances", async () => {
		const result = await registry.registerInstance({
			serviceName: "financial-scraper" as ServiceId,
			instanceId: "node-1" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		expect(result.instanceId).toBe("node-1");
		expect(result.token).toBeDefined();

		const instances = await registry.instanceStore.getInstances(
			"financial-scraper" as unknown as ServiceInstanceName
		);
		expect(instances).toHaveLength(1);
		expect(instances[0].host).toBe("10.0.0.1");
	});

	it("should register multiple instances for the same service", async () => {
		await registry.registerInstance({
			serviceName: "financial-scraper" as ServiceId,
			instanceId: "node-1" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		await registry.registerInstance({
			serviceName: "financial-scraper" as ServiceId,
			instanceId: "node-2" as InstanceId,
			host: "10.0.0.2" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		expect(
			registry.instanceStore.getInstances(
				"financial-scraper" as unknown as ServiceInstanceName
			)
		).toHaveLength(2);
	});

	it("should validate instance tokens after registration", async () => {
		const registered = await registry.registerInstance({
			serviceName: "financial-scraper" as ServiceId,
			instanceId: "node-1" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		expect(
			await registry.tokenManager.validInstanceToken({
				token: registered.token as string as AuthToken,
				instanceId: "node-1" as InstanceId,
			})
		).toBe(true);
		expect(
			await registry.tokenManager.validInstanceToken({
				token: "wrong-token" as AuthToken,
				instanceId: "node-1" as InstanceId,
			})
		).toBe(false);
	});

	it("should handle full heartbeat flow", async () => {
		const registered = await registry.registerInstance({
			serviceName: "financial-scraper" as ServiceId,
			instanceId: "node-1" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		const token = registered.token as string as AuthToken;
		expect(
			await registry.tokenManager.validInstanceToken({
				token,
				instanceId: "node-1" as InstanceId,
			})
		).toBe(true);

		const ttl = registry.instanceStore.updateHeartbeat({
			serviceName: "financial-scraper" as ServiceId,
			instanceId: "node-1" as InstanceId,
		});
		expect(ttl).toBe(30_000);

		const newToken = await registry.updateToken("node-1" as InstanceId);
		expect(newToken).not.toBe(token);
		expect(
			await registry.tokenManager.validInstanceToken({
				token: newToken as AuthToken,
				instanceId: "node-1" as InstanceId,
			})
		).toBe(true);
		expect(
			await registry.tokenManager.validInstanceToken({
				token,
				instanceId: "node-1" as InstanceId,
			})
		).toBe(false);
	});

	it("should remove instance and update token on removeInstance", async () => {
		await registry.registerInstance({
			serviceName: "financial-scraper" as ServiceId,
			instanceId: "node-1" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		await registry.registerInstance({
			serviceName: "message-manager" as ServiceId,
			instanceId: "msg-1" as InstanceId,
			host: "10.0.0.2" as IPAddress,
			port: 8445 as Port,
			ttl: 60_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		const removed = await registry.removeInstance({
			serviceName: "financial-scraper" as ServiceId,
			instanceId: "node-1" as InstanceId,
		});
		expect(removed).toBe(true);
		expect(
			registry.instanceStore.getInstances(
				"financial-scraper" as unknown as ServiceInstanceName
			)
		).toHaveLength(0);
		expect(
			await registry.tokenManager.validInstanceToken({
				token: "any-token" as AuthToken,
				instanceId: "node-1" as InstanceId,
			})
		).toBe(false);
		expect(registry.instanceStore.listServiceNames()).toEqual([
			"message-manager",
		]);
	});

	it("should expose a dump of current registry state", async () => {
		await registry.registerInstance({
			serviceName: "financial-scraper" as ServiceId,
			instanceId: "node-1" as InstanceId,
			host: "10.0.0.1" as IPAddress,
			port: 8444 as Port,
			ttl: 30_000 as DurationMs,
			protocol: "mtls" as unknown as Protocol,
			version: "1.0.0" as Version,
			registeredAt: Date.now() as UnixTimestamp,
			lastHeartbeat: Date.now() as UnixTimestamp,
		});

		const snapshot = await registry.instanceStore.dump();
		expect(snapshot["financial-scraper" as ServiceInstanceName]).toBeDefined();
		expect(snapshot["financial-scraper" as ServiceInstanceName]).toHaveLength(
			1
		);
	});

	it("should verify instance names against known services", async () => {
		expect(
			registry.tokenManager.verifyInstanceName(
				"financial-scraper" as unknown as ServiceInstanceName
			)
		).toBe(true);
		expect(
			registry.tokenManager.verifyInstanceName(
				"message-manager" as unknown as ServiceInstanceName
			)
		).toBe(true);
		expect(
			registry.tokenManager.verifyInstanceName(
				"discovery-server" as unknown as ServiceInstanceName
			)
		).toBe(true);
		expect(
			registry.tokenManager.verifyInstanceName(
				"completely-fake-service" as unknown as ServiceInstanceName
			)
		).toBe(false);
	});
});
