import { describe, expect, it } from "@jest/globals";
import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import { InMemoryRegistryBackend } from "../../src/core/registry-backend";

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		serviceName: "financial-scraper-service",
		instanceId: "test-instance-1",
		ip: "192.168.1.10",
		port: 8444,
		version: "1.0.0",
		ttl: 30_000,
		protocol: "mtls",
		registeredAt: Date.now() - 1000,
		lastHeartbeat: Date.now() - 500,
		...overrides,
	};
}

describe("InMemoryRegistryBackend", () => {
	it("should support region field in registration", async () => {
		const backend = new InMemoryRegistryBackend();
		await backend.registerInstance(makeInstance({ region: "us-east-1" }));

		const instances = await backend.getInstances("financial-scraper-service");
		expect(instances[0].region).toBe("us-east-1");
	});

	it("should filter by region via getInstances", async () => {
		const backend = new InMemoryRegistryBackend();
		await backend.registerInstance(
			makeInstance({ instanceId: "i1", region: "us-east-1" })
		);
		await backend.registerInstance(
			makeInstance({ instanceId: "i2", region: "eu-west-1" })
		);

		const all = await backend.getInstances("financial-scraper-service");
		expect(all).toHaveLength(2);
		expect(all.filter((i) => i.region === "us-east-1")).toHaveLength(1);
		expect(all.filter((i) => i.region === "eu-west-1")).toHaveLength(1);
	});

	it("should handle region-unspecified instances", async () => {
		const backend = new InMemoryRegistryBackend();
		await backend.registerInstance(makeInstance({ instanceId: "i1" }));

		const instances = await backend.getInstances("financial-scraper-service");
		expect(instances[0].region).toBeUndefined();
	});

	it("should support start/stop lifecycle without error", () => {
		const backend = new InMemoryRegistryBackend();
		expect(() => backend.start()).not.toThrow();
		expect(() => backend.stop()).not.toThrow();
	});

	describe("updateHeartbeat", () => {
		it("should update heartbeat and return TTL", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance());
			const result = await backend.updateHeartbeat(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBe(30000);
		});

		it("should return false for unknown service", async () => {
			const backend = new InMemoryRegistryBackend();
			const result = await backend.updateHeartbeat(
				"unknown-service",
				"test-instance-1"
			);
			expect(result).toBe(false);
		});

		it("should return false for unknown instance", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance());
			const result = await backend.updateHeartbeat(
				"financial-scraper-service",
				"unknown-instance"
			);
			expect(result).toBe(false);
		});
	});

	describe("updateToken", () => {
		it("should return a new token", async () => {
			const backend = new InMemoryRegistryBackend();
			const token = await backend.updateToken("test-instance-1");
			expect(typeof token).toBe("string");
			expect(token.length).toBeGreaterThan(0);
		});

		it("should return different tokens on successive calls", async () => {
			const backend = new InMemoryRegistryBackend();
			const t1 = await backend.updateToken("test-instance-1");
			const t2 = await backend.updateToken("test-instance-1");
			expect(t1).not.toBe(t2);
		});
	});

	describe("getInstances", () => {
		it("should return empty array for unknown service", async () => {
			const backend = new InMemoryRegistryBackend();
			const instances = await backend.getInstances("unknown-service");
			expect(instances).toEqual([]);
		});

		it("should return all registered instances", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance({ instanceId: "i1" }));
			await backend.registerInstance(makeInstance({ instanceId: "i2" }));
			const instances = await backend.getInstances("financial-scraper-service");
			expect(instances).toHaveLength(2);
		});
	});

	describe("getInstance", () => {
		it("should return a specific instance", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance());
			const instance = await backend.getInstance(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(instance).toBeDefined();
			expect(instance!.instanceId).toBe("test-instance-1");
		});

		it("should return undefined for unknown service", async () => {
			const backend = new InMemoryRegistryBackend();
			const instance = await backend.getInstance(
				"unknown-service",
				"test-instance-1"
			);
			expect(instance).toBeUndefined();
		});

		it("should return undefined for unknown instance", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance());
			const instance = await backend.getInstance(
				"financial-scraper-service",
				"unknown-instance"
			);
			expect(instance).toBeUndefined();
		});
	});

	describe("removeInstance", () => {
		it("should remove an instance and return true", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance());
			const result = await backend.removeInstance(
				"financial-scraper-service",
				"test-instance-1"
			);
			expect(result).toBe(true);
			const instances = await backend.getInstances("financial-scraper-service");
			expect(instances).toHaveLength(0);
		});

		it("should remove the service map when last instance is removed", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance());
			await backend.removeInstance(
				"financial-scraper-service",
				"test-instance-1"
			);
			const names = await backend.listServiceNames();
			expect(names).not.toContain("financial-scraper-service");
		});

		it("should return false for unknown service", async () => {
			const backend = new InMemoryRegistryBackend();
			const result = await backend.removeInstance(
				"unknown-service",
				"test-instance-1"
			);
			expect(result).toBe(false);
		});

		it("should return false for unknown instance", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance());
			const result = await backend.removeInstance(
				"financial-scraper-service",
				"unknown-instance"
			);
			expect(result).toBe(false);
		});
	});

	describe("listServiceNames", () => {
		it("should return empty array for empty registry", async () => {
			const backend = new InMemoryRegistryBackend();
			const names = await backend.listServiceNames();
			expect(names).toEqual([]);
		});

		it("should return all unique service names", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(
				makeInstance({ serviceName: "financial-scraper-service" })
			);
			await backend.registerInstance(
				makeInstance({
					serviceName: "message-delivery-service",
					instanceId: "m1",
				})
			);
			const names = await backend.listServiceNames();
			expect(names).toContain("financial-scraper-service");
			expect(names).toContain("message-delivery-service");
			expect(names).toHaveLength(2);
		});
	});

	describe("dump", () => {
		it("should return empty object for empty registry", async () => {
			const backend = new InMemoryRegistryBackend();
			const snapshot = await backend.dump();
			expect(snapshot).toEqual({});
		});

		it("should return a snapshot of all instances grouped by service", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance({ instanceId: "i1" }));
			await backend.registerInstance(makeInstance({ instanceId: "i2" }));
			await backend.registerInstance(
				makeInstance({
					serviceName: "message-delivery-service",
					instanceId: "m1",
				})
			);
			const snapshot = await backend.dump();
			expect(Object.keys(snapshot)).toHaveLength(2);
			expect(snapshot["financial-scraper-service"]).toHaveLength(2);
			expect(snapshot["message-delivery-service"]).toHaveLength(1);
		});
	});

	describe("generateInstanceToken", () => {
		it("should return a non-empty 4-part token", () => {
			const backend = new InMemoryRegistryBackend();
			const token = backend.generateInstanceToken("test-instance-1");
			expect(typeof token).toBe("string");
			expect(token.split(".")).toHaveLength(4);
		});

		it("should return different tokens for different calls", () => {
			const backend = new InMemoryRegistryBackend();
			const t1 = backend.generateInstanceToken("test-instance-1");
			const t2 = backend.generateInstanceToken("test-instance-1");
			expect(t1).not.toBe(t2);
		});
	});

	describe("generateInstanceId", () => {
		it("should return a non-empty base64 string", () => {
			const backend = new InMemoryRegistryBackend();
			const id = backend.generateInstanceId({
				serviceName: "financial-scraper-service",
				address: "192.168.1.10",
				port: 8444,
			});
			expect(typeof id).toBe("string");
			expect(id.length).toBeGreaterThan(0);
		});
	});

	describe("validInstanceToken", () => {
		it("should return true for a valid token", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance());
			const token = await backend.updateToken("test-instance-1");
			const result = await backend.validInstanceToken(token, "test-instance-1");
			expect(result).toBe(true);
		});

		it("should return false for token with wrong part count", async () => {
			const backend = new InMemoryRegistryBackend();
			const result = await backend.validInstanceToken(
				"invalid-token",
				"test-instance-1"
			);
			expect(result).toBe(false);
		});

		it("should return false when decodedId does not match instanceId", async () => {
			const backend = new InMemoryRegistryBackend();
			const result = await backend.validInstanceToken(
				"dGVzdC1pbnN0YW5jZS0x.dGVzdA.dGVzdA.dGVzdA",
				"wrong-id"
			);
			expect(result).toBe(false);
		});

		it("should return false for invalid HMAC signature", async () => {
			const backend = new InMemoryRegistryBackend();
			const result = await backend.validInstanceToken(
				`dGVzdC1pbnN0YW5jZS0x.dGVzdA.dGVzdA.${"a".repeat(43)}`,
				"test-instance-1"
			);
			expect(result).toBe(false);
		});

		it("should return false when stored token differs", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance());
			const token = backend.generateInstanceToken("test-instance-1");
			const result = await backend.validInstanceToken(token, "test-instance-1");
			expect(result).toBe(false);
		});

		it("should return false when signature length differs from expected HMAC", async () => {
			const backend = new InMemoryRegistryBackend();
			const result = await backend.validInstanceToken(
				`dGVzdC1pbnN0YW5jZS0x.dGVzdA.dGVzdA.${"a".repeat(100)}`,
				"test-instance-1"
			);
			expect(result).toBe(false);
		});
	});

	describe("verifyInstanceName", () => {
		it("should return true for known service names", () => {
			const backend = new InMemoryRegistryBackend();
			expect(backend.verifyInstanceName("financial-scraper-service")).toBe(
				true
			);
			expect(backend.verifyInstanceName("discovery-service")).toBe(true);
		});

		it("should return false for unknown service names", () => {
			const backend = new InMemoryRegistryBackend();
			expect(backend.verifyInstanceName("completely-made-up-service")).toBe(
				false
			);
		});
	});

	describe("registerInstance", () => {
		it("should update instance metadata on re-registration", async () => {
			const backend = new InMemoryRegistryBackend();
			await backend.registerInstance(makeInstance({ port: 8444 }));
			await backend.registerInstance(makeInstance({ port: 9999 }));
			const instances = await backend.getInstances("financial-scraper-service");
			expect(instances[0].port).toBe(9999);
		});
	});
});
