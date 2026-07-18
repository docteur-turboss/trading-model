import { beforeEach, describe, expect, it } from "@jest/globals";
import { ServiceRegistry } from "../../src/core/service-registry";
import {
	otherServiceInstance,
	secondServiceInstance,
	validServiceInstance,
} from "../fixtures/index";

describe("ServiceRegistry", () => {
	let registry: ServiceRegistry;

	beforeEach(() => {
		registry = new ServiceRegistry();
	});

	describe("registerInstance", () => {
		it("should register a new instance and return it with a token", () => {
			const result = registry.registerInstance(validServiceInstance());
			expect(result.instanceId).toBe("test-instance-1");
			expect(result.serviceName).toBe("financial-scraper-service");
			expect(result.registeredAt).toBeGreaterThan(0);
			expect(result.lastHeartbeat).toBeGreaterThan(0);
			expect(result).toHaveProperty("token");
		});

		it("should update an existing instance on re-registration", () => {
			const first = registry.registerInstance(validServiceInstance());
			const updated = registry.registerInstance(
				validServiceInstance({ port: 9999 })
			);
			expect(updated.instanceId).toBe("test-instance-1");
			expect(updated.port).toBe(9999);
			expect(updated.lastHeartbeat).toBeGreaterThanOrEqual(
				first.lastHeartbeat!
			);
		});

		it("should update lastHeartbeat on re-registration", () => {
			const first = registry.registerInstance(
				validServiceInstance({ lastHeartbeat: Date.now() - 5000 })
			);
			const updated = registry.registerInstance(
				validServiceInstance({ lastHeartbeat: Date.now() })
			);
			expect(updated.lastHeartbeat).toBeGreaterThanOrEqual(
				first.lastHeartbeat!
			);
		});
	});

	describe("updateHeartbeat", () => {
		it("should update heartbeat and return TTL", () => {
			registry.registerInstance(validServiceInstance());
			const result = registry.instanceStore.updateHeartbeat({
				serviceName: "financial-scraper-service",
				instanceId: "test-instance-1",
			});
			expect(result).toBe(30_000);
		});

		it("should return false for unknown service", () => {
			const result = registry.instanceStore.updateHeartbeat({
				serviceName: "unknown-service",
				instanceId: "test-instance-1",
			});
			expect(result).toBe(false);
		});

		it("should return false for unknown instance", () => {
			registry.registerInstance(validServiceInstance());
			const result = registry.instanceStore.updateHeartbeat({
				serviceName: "financial-scraper-service",
				instanceId: "unknown-instance",
			});
			expect(result).toBe(false);
		});
	});

	describe("updateToken", () => {
		it("should return a new token for a registered instance", () => {
			const registered = registry.registerInstance(validServiceInstance());
			const newToken = registry.updateToken(registered.instanceId!);
			expect(typeof newToken).toBe("string");
			expect(newToken.length).toBeGreaterThan(0);
		});

		it("should return different tokens on successive calls", () => {
			const registered = registry.registerInstance(validServiceInstance());
			const token1 = registry.updateToken(registered.instanceId!);
			const token2 = registry.updateToken(registered.instanceId!);
			expect(token1).not.toBe(token2);
		});
	});

	describe("getInstances", () => {
		it("should return all instances for a service", () => {
			registry.registerInstance(validServiceInstance());
			registry.registerInstance(secondServiceInstance());
			const instances = registry.instanceStore.getInstances(
				"financial-scraper-service"
			);
			expect(instances).toHaveLength(2);
		});

		it("should return empty array for unknown service", () => {
			const instances = registry.instanceStore.getInstances("unknown-service");
			expect(instances).toEqual([]);
		});
	});

	describe("getInstance", () => {
		it("should return a specific instance", () => {
			registry.registerInstance(validServiceInstance());
			const instance = registry.instanceStore.getInstance({
				serviceName: "financial-scraper-service",
				instanceId: "test-instance-1",
			});
			expect(instance).toBeDefined();
			expect(instance!.instanceId).toBe("test-instance-1");
		});

		it("should return undefined for unknown service", () => {
			const instance = registry.instanceStore.getInstance({
				serviceName: "unknown-service",
				instanceId: "test-instance-1",
			});
			expect(instance).toBeUndefined();
		});

		it("should return undefined for unknown instance", () => {
			registry.registerInstance(validServiceInstance());
			const instance = registry.instanceStore.getInstance({
				serviceName: "financial-scraper-service",
				instanceId: "unknown-instance",
			});
			expect(instance).toBeUndefined();
		});
	});

	describe("removeInstance", () => {
		it("should remove an instance and return true", () => {
			registry.registerInstance(validServiceInstance());
			const removed = registry.removeInstance({
				serviceName: "financial-scraper-service",
				instanceId: "test-instance-1",
			});
			expect(removed).toBe(true);
			expect(
				registry.instanceStore.getInstances("financial-scraper-service")
			).toHaveLength(0);
		});

		it("should remove the service map when last instance is removed", () => {
			registry.registerInstance(validServiceInstance());
			registry.removeInstance({
				serviceName: "financial-scraper-service",
				instanceId: "test-instance-1",
			});
			expect(registry.instanceStore.listServiceNames()).not.toContain(
				"financial-scraper-service"
			);
		});

		it("should return false for unknown service", () => {
			const removed = registry.removeInstance({
				serviceName: "unknown-service",
				instanceId: "test-instance-1",
			});
			expect(removed).toBe(false);
		});

		it("should return false for unknown instance", () => {
			registry.registerInstance(validServiceInstance());
			const removed = registry.removeInstance({
				serviceName: "financial-scraper-service",
				instanceId: "unknown-instance",
			});
			expect(removed).toBe(false);
		});
	});

	describe("listServiceNames", () => {
		it("should return empty array for empty registry", () => {
			expect(registry.instanceStore.listServiceNames()).toEqual([]);
		});

		it("should return all unique service names", () => {
			registry.registerInstance(validServiceInstance());
			registry.registerInstance(secondServiceInstance());
			registry.registerInstance(otherServiceInstance());
			const names = registry.instanceStore.listServiceNames();
			expect(names).toContain("financial-scraper-service");
			expect(names).toContain("message-delivery-service");
			expect(names).toHaveLength(2);
		});
	});

	describe("dump", () => {
		it("should return empty object for empty registry", () => {
			expect(registry.instanceStore.dump()).toEqual({});
		});

		it("should return a snapshot of all instances grouped by service", () => {
			registry.registerInstance(validServiceInstance());
			registry.registerInstance(secondServiceInstance());
			registry.registerInstance(otherServiceInstance());
			const snapshot = registry.instanceStore.dump();
			expect(Object.keys(snapshot)).toHaveLength(2);
			expect(snapshot["financial-scraper-service"]).toHaveLength(2);
			expect(snapshot["message-delivery-service"]).toHaveLength(1);
		});
	});

	describe("generateInstanceToken", () => {
		it("should return a non-empty string", () => {
			const token = registry.tokenManager.generateToken("test-instance-1");
			expect(typeof token).toBe("string");
			expect(token.length).toBeGreaterThan(0);
		});

		it("should return different tokens for different calls", () => {
			const t1 = registry.tokenManager.generateToken("test-instance-1");
			const t2 = registry.tokenManager.generateToken("test-instance-1");
			expect(t1).not.toBe(t2);
		});
	});

	describe("generateInstanceId", () => {
		it("should return a non-empty base64 string", () => {
			const id = registry.tokenManager.generateInstanceId({
				serviceName: "financial-scraper-service",
				address: "192.168.1.10",
				port: 8444,
			});
			expect(typeof id).toBe("string");
			expect(id.length).toBeGreaterThan(0);
		});
	});

	describe("validInstanceToken", () => {
		it("should return true for a valid token", () => {
			const registered = registry.registerInstance(validServiceInstance());
			const isValid = registry.tokenManager.validInstanceToken({
				token: registered.token as string,
				instanceId: registered.instanceId!,
			});
			expect(isValid).toBe(true);
		});

		it("should return false for a token with wrong part count", () => {
			registry.registerInstance(validServiceInstance());
			const isValid = registry.tokenManager.validInstanceToken({
				token: "invalid-token",
				instanceId: "test-instance-1",
			});
			expect(isValid).toBe(false);
		});

		it("should return false for unknown instance", () => {
			const isValid = registry.tokenManager.validInstanceToken({
				token: "a.b.c.d",
				instanceId: "unknown-instance",
			});
			expect(isValid).toBe(false);
		});

		it("should return false when encodedId is not valid base64url", () => {
			const isValid = registry.tokenManager.validInstanceToken({
				token: "!!!.dGVzdA.dGVzdA.dGVzdA",
				instanceId: "test-instance-1",
			});
			expect(isValid).toBe(false);
		});

		it("should return false when decodedId does not match instanceId", () => {
			const isValid = registry.tokenManager.validInstanceToken({
				token: "dGVzdC1pbnN0YW5jZS0x.dGVzdA.dGVzdA.dGVzdA",
				instanceId: "wrong-instance",
			});
			expect(isValid).toBe(false);
		});

		it("should return false when HMAC signature is invalid", () => {
			const isValid = registry.tokenManager.validInstanceToken({
				token: `dGVzdC1pbnN0YW5jZS0x.dGVzdA.dGVzdA.${"a".repeat(43)}`,
				instanceId: "test-instance-1",
			});
			expect(isValid).toBe(false);
		});

		it("should return false when signature length differs from expected HMAC", () => {
			const isValid = registry.tokenManager.validInstanceToken({
				token: `dGVzdC1pbnN0YW5jZS0x.dGVzdA.dGVzdA.${"a".repeat(100)}`,
				instanceId: "test-instance-1",
			});
			expect(isValid).toBe(false);
		});
	});

	describe("verifyInstanceName", () => {
		it("should return true for known service names", () => {
			const result = registry.tokenManager.verifyInstanceName(
				"financial-scraper-service"
			);
			expect(result).toBe(true);
		});

		it("should return false for unknown service names", () => {
			const result = registry.tokenManager.verifyInstanceName(
				"completely-made-up-service"
			);
			expect(result).toBe(false);
		});
	});
});
