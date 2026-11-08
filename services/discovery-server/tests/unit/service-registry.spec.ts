import { beforeEach, describe, expect, it } from "@jest/globals";
import type {
	AuthToken,
	InstanceId,
	Port,
	ServiceId,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import { InstanceStore } from "../../src/adapters/outbound/instance-store";
import { createServiceRegistry } from "../../src/config/container";
import type { ServiceRegistry } from "../../src/domain/service-registry";
import {
	otherServiceInstance,
	secondServiceInstance,
	validServiceInstance,
} from "../fixtures/index";

jest.mock("../../src/infrastructure/monitoring/metrics", () => ({
	setRegisteredInstances: jest.fn(),
	setRegisteredInstancesPerService: jest.fn(),
}));

import {
	setRegisteredInstances,
	setRegisteredInstancesPerService,
} from "../../src/infrastructure/monitoring/metrics";

describe("ServiceRegistry", () => {
	let registry: ServiceRegistry;

	beforeEach(() => {
		registry = createServiceRegistry({
			metrics: { setRegisteredInstances, setRegisteredInstancesPerService },
		});
	});

	describe("registerInstance", () => {
		it("should register a new instance and return it with a token", async () => {
			const result = await registry.registerInstance(validServiceInstance());
			expect(result.instanceId).toBe("test-instance-1");
			expect(result.serviceName).toBe("financial-scraper-service");
			expect(result.registeredAt).toBeGreaterThan(0);
			expect(result.lastHeartbeat).toBeGreaterThan(0);
			expect(result).toHaveProperty("token");
			expect(setRegisteredInstances).toHaveBeenLastCalledWith(1);
			expect(setRegisteredInstancesPerService).toHaveBeenCalledWith(
				"financial-scraper-service",
				1
			);
		});

		it("should update an existing instance on re-registration", async () => {
			const first = await registry.registerInstance(validServiceInstance());
			const updated = await registry.registerInstance(
				validServiceInstance({ port: 9999 as Port })
			);
			expect(updated.instanceId).toBe("test-instance-1");
			expect(updated.port).toBe(9999);
			expect(updated.lastHeartbeat).toBeGreaterThanOrEqual(
				first.lastHeartbeat!
			);
		});

		it("should update lastHeartbeat on re-registration", async () => {
			const first = await registry.registerInstance(
				validServiceInstance({
					lastHeartbeat: (Date.now() - 5000) as UnixTimestamp,
				})
			);
			const updated = await registry.registerInstance(
				validServiceInstance({ lastHeartbeat: Date.now() as UnixTimestamp })
			);
			expect(updated.lastHeartbeat).toBeGreaterThanOrEqual(
				first.lastHeartbeat!
			);
		});
	});

	describe("updateHeartbeat", () => {
		it("should update heartbeat and return TTL", async () => {
			await registry.registerInstance(validServiceInstance());
			const result = registry.instanceStore.updateHeartbeat({
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(result).toBe(30_000);
		});

		it("should return false for unknown service", async () => {
			const result = registry.instanceStore.updateHeartbeat({
				serviceName: "unknown-service" as ServiceId,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(result).toBe(false);
		});

		it("should return false for unknown instance", async () => {
			await registry.registerInstance(validServiceInstance());
			const result = registry.instanceStore.updateHeartbeat({
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "unknown-instance" as InstanceId,
			});
			expect(result).toBe(false);
		});
	});

	describe("updateToken", () => {
		it("should return a new token for a registered instance", async () => {
			const registered = await registry.registerInstance(
				validServiceInstance()
			);
			const newToken = await registry.updateToken(registered.instanceId!);
			expect(typeof newToken).toBe("string");
			expect(newToken.length).toBeGreaterThan(0);
		});

		it("should return different tokens on successive calls", async () => {
			const registered = await registry.registerInstance(
				validServiceInstance()
			);
			const token1 = await registry.updateToken(registered.instanceId!);
			const token2 = await registry.updateToken(registered.instanceId!);
			expect(token1).not.toBe(token2);
		});
	});

	describe("getInstances", () => {
		it("should return all instances for a service", async () => {
			await registry.registerInstance(validServiceInstance());
			await registry.registerInstance(secondServiceInstance());
			const instances = registry.instanceStore.getInstances(
				"financial-scraper-service" as unknown as ServiceInstanceName
			);
			expect(instances).toHaveLength(2);
		});

		it("should return empty array for unknown service", async () => {
			const instances = registry.instanceStore.getInstances(
				"unknown-service" as unknown as ServiceInstanceName
			);
			expect(instances).toEqual([]);
		});
	});

	describe("getInstance", () => {
		it("should return a specific instance", async () => {
			await registry.registerInstance(validServiceInstance());
			const instance = registry.instanceStore.getInstance({
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(instance).toBeDefined();
			expect(instance!.instanceId).toBe("test-instance-1");
		});

		it("should return undefined for unknown service", async () => {
			const instance = registry.instanceStore.getInstance({
				serviceName: "unknown-service" as ServiceId,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(instance).toBeUndefined();
		});

		it("should return undefined for unknown instance", async () => {
			await registry.registerInstance(validServiceInstance());
			const instance = registry.instanceStore.getInstance({
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "unknown-instance" as InstanceId,
			});
			expect(instance).toBeUndefined();
		});
	});

	describe("removeInstance", () => {
		it("should remove an instance and return true", async () => {
			await registry.registerInstance(validServiceInstance());
			const removed = await registry.removeInstance({
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(removed).toBe(true);
			expect(
				registry.instanceStore.getInstances(
					"financial-scraper-service" as unknown as ServiceInstanceName
				)
			).toHaveLength(0);
			expect(setRegisteredInstances).toHaveBeenLastCalledWith(0);
		});

		it("should remove the service map when last instance is removed", async () => {
			await registry.registerInstance(validServiceInstance());
			await registry.removeInstance({
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(registry.instanceStore.listServiceNames()).not.toContain(
				"financial-scraper-service"
			);
		});

		it("should return false for unknown service", async () => {
			const removed = await registry.removeInstance({
				serviceName: "unknown-service" as ServiceId,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(removed).toBe(false);
		});

		it("should return false for unknown instance", async () => {
			await registry.registerInstance(validServiceInstance());
			const removed = await registry.removeInstance({
				serviceName: "financial-scraper-service" as ServiceId,
				instanceId: "unknown-instance" as InstanceId,
			});
			expect(removed).toBe(false);
		});
	});

	describe("syncRegisteredInstanceMetrics", () => {
		it("should count instances removed by another replica sharing the store", async () => {
			const instanceStore = new InstanceStore();
			const replicaA = createServiceRegistry({
				instanceStore,
				metrics: { setRegisteredInstances, setRegisteredInstancesPerService },
			});
			const replicaB = createServiceRegistry({ instanceStore });
			await replicaA.registerInstance(validServiceInstance());
			await replicaB.removeInstance({
				serviceName: "financial-scraper-service",
				instanceId: "test-instance-1",
			} as never);
			jest.clearAllMocks();

			await replicaA.syncRegisteredInstanceMetrics();

			expect(setRegisteredInstancesPerService).toHaveBeenCalledWith(
				"financial-scraper",
				0
			);
			// Empty legacy names are not exported (InstanceCountLow on upgrade).
			expect(setRegisteredInstancesPerService).not.toHaveBeenCalledWith(
				"financial-scraper-service",
				expect.anything()
			);
			expect(setRegisteredInstances).toHaveBeenLastCalledWith(0);
		});
	});

	describe("listServiceNames", () => {
		it("should return empty array for empty registry", async () => {
			expect(registry.instanceStore.listServiceNames()).toEqual([]);
		});

		it("should return all unique service names", async () => {
			await registry.registerInstance(validServiceInstance());
			await registry.registerInstance(secondServiceInstance());
			await registry.registerInstance(otherServiceInstance());
			const names = registry.instanceStore.listServiceNames();
			expect(names).toContain("financial-scraper-service");
			expect(names).toContain("message-delivery-service");
			expect(names).toHaveLength(2);
		});
	});

	describe("dump", () => {
		it("should return empty object for empty registry", async () => {
			expect(registry.instanceStore.dump()).toEqual({});
		});

		it("should return a snapshot of all instances grouped by service", async () => {
			await registry.registerInstance(validServiceInstance());
			await registry.registerInstance(secondServiceInstance());
			await registry.registerInstance(otherServiceInstance());
			const snapshot = registry.instanceStore.dump();
			expect(Object.keys(snapshot)).toHaveLength(2);
			expect(snapshot["financial-scraper-service"]).toHaveLength(2);
			expect(snapshot["message-delivery-service"]).toHaveLength(1);
		});
	});

	describe("generateInstanceToken", () => {
		it("should return a non-empty string", async () => {
			const token = registry.tokenManager.generateToken(
				"test-instance-1" as InstanceId
			);
			expect(typeof token).toBe("string");
			expect(token.length).toBeGreaterThan(0);
		});

		it("should return different tokens for different calls", async () => {
			const t1 = registry.tokenManager.generateToken(
				"test-instance-1" as InstanceId
			);
			const t2 = registry.tokenManager.generateToken(
				"test-instance-1" as InstanceId
			);
			expect(t1).not.toBe(t2);
		});
	});

	describe("generateInstanceId", () => {
		it("should return a non-empty base64 string", async () => {
			const id = registry.tokenManager.generateInstanceId({
				serviceName: "financial-scraper-service" as ServiceId,
				address: "192.168.1.10",
				port: 8444 as Port,
			});
			expect(typeof id).toBe("string");
			expect(id.length).toBeGreaterThan(0);
		});
	});

	describe("validInstanceToken", () => {
		it("should return true for a valid token", async () => {
			const registered = await registry.registerInstance(
				validServiceInstance()
			);
			const isValid = await registry.tokenManager.validInstanceToken({
				token: registered.token as string as AuthToken,
				instanceId: registered.instanceId!,
			});
			expect(isValid).toBe(true);
		});

		it("should return false for a token with wrong part count", async () => {
			await registry.registerInstance(validServiceInstance());
			const isValid = await registry.tokenManager.validInstanceToken({
				token: "invalid-token" as AuthToken,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(isValid).toBe(false);
		});

		it("should return false for unknown instance", async () => {
			const isValid = await registry.tokenManager.validInstanceToken({
				token: "a.b.c.d" as AuthToken,
				instanceId: "unknown-instance" as InstanceId,
			});
			expect(isValid).toBe(false);
		});

		it("should return false when encodedId is not valid base64url", async () => {
			const isValid = await registry.tokenManager.validInstanceToken({
				token: "!!!.dGVzdA.dGVzdA.dGVzdA" as AuthToken,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(isValid).toBe(false);
		});

		it("should return false when decodedId does not match instanceId", async () => {
			const isValid = await registry.tokenManager.validInstanceToken({
				token: "dGVzdC1pbnN0YW5jZS0x.dGVzdA.dGVzdA.dGVzdA" as AuthToken,
				instanceId: "wrong-instance" as InstanceId,
			});
			expect(isValid).toBe(false);
		});

		it("should return false when HMAC signature is invalid", async () => {
			const isValid = await registry.tokenManager.validInstanceToken({
				token:
					`dGVzdC1pbnN0YW5jZS0x.dGVzdA.dGVzdA.${"a".repeat(43)}` as AuthToken,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(isValid).toBe(false);
		});

		it("should return false when signature length differs from expected HMAC", async () => {
			const isValid = await registry.tokenManager.validInstanceToken({
				token:
					`dGVzdC1pbnN0YW5jZS0x.dGVzdA.dGVzdA.${"a".repeat(100)}` as AuthToken,
				instanceId: "test-instance-1" as InstanceId,
			});
			expect(isValid).toBe(false);
		});
	});

	describe("verifyInstanceName", () => {
		it("should return true for known service names", async () => {
			const result = registry.tokenManager.verifyInstanceName(
				"financial-scraper-service" as unknown as ServiceInstanceName
			);
			expect(result).toBe(true);
		});

		it("should return false for unknown service names", async () => {
			const result = registry.tokenManager.verifyInstanceName(
				"completely-made-up-service" as unknown as ServiceInstanceName
			);
			expect(result).toBe(false);
		});
	});
});
