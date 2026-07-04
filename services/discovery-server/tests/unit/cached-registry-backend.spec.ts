import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import { CachedRegistryBackend } from "../../src/core/cached-registry-backend";

function createMockBackend(): jest.Mocked<RegistryBackend> {
	return {
		registerInstance: jest.fn(),
		updateHeartbeat: jest.fn(),
		updateToken: jest.fn(),
		getInstances: jest.fn(),
		getInstance: jest.fn(),
		removeInstance: jest.fn(),
		listServiceNames: jest.fn(),
		dump: jest.fn(),
		validInstanceToken: jest.fn(),
		generateInstanceToken: jest.fn(),
		verifyInstanceName: jest.fn(),
		generateInstanceId: jest.fn(),
		start: jest.fn(),
		stop: jest.fn(),
	} as unknown as jest.Mocked<RegistryBackend>;
}

const MAKE_INSTANCE = (id: string): ServiceInstance => ({
	serviceName: "svc",
	instanceId: id,
	ip: "127.0.0.1",
	port: 8080,
	protocol: "http",
	lastHeartbeat: Date.now(),
	registeredAt: Date.now(),
	version: "1.0.0",
	ttl: 30000,
});

describe("CachedRegistryBackend", () => {
	let mockBackend: jest.Mocked<RegistryBackend>;
	let cachedBackend: CachedRegistryBackend;

	beforeEach(() => {
		jest.useFakeTimers();
		mockBackend = createMockBackend();
		cachedBackend = new CachedRegistryBackend(mockBackend, 5000, undefined, 3);
	});

	afterEach(() => {
		cachedBackend.stop();
		jest.useRealTimers();
	});

	describe("getInstances", () => {
		it("should fetch from backend on cache miss", async () => {
			const instances = [MAKE_INSTANCE("i-1")];
			mockBackend.getInstances.mockResolvedValue(instances);

			const result = await cachedBackend.getInstances("svc");

			expect(mockBackend.getInstances).toHaveBeenCalledWith("svc");
			expect(result).toEqual(instances);
		});

		it("should return cached data on cache hit within TTL", async () => {
			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-1")]);

			await cachedBackend.getInstances("svc");
			const result = await cachedBackend.getInstances("svc");

			expect(mockBackend.getInstances).toHaveBeenCalledTimes(1);
			expect(result).toHaveLength(1);
		});

		it("should re-fetch when cache expires", async () => {
			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-1")]);
			await cachedBackend.getInstances("svc");

			jest.advanceTimersByTime(5001);

			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-2")]);
			const result = await cachedBackend.getInstances("svc");

			expect(mockBackend.getInstances).toHaveBeenCalledTimes(2);
			expect(result[0].instanceId).toBe("i-2");
		});
	});

	describe("cache invalidation on mutations", () => {
		it("should refresh cache on registerInstance", async () => {
			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-1")]);
			mockBackend.registerInstance.mockResolvedValue("token-1");

			await cachedBackend.getInstances("svc");

			// Update mock BEFORE register so refreshCache gets fresh data
			mockBackend.getInstances.mockResolvedValue([
				MAKE_INSTANCE("i-1"),
				MAKE_INSTANCE("i-2"),
			]);
			await cachedBackend.registerInstance(MAKE_INSTANCE("i-2"));

			// Cache should already be refreshed by register → no extra backend call
			const result = await cachedBackend.getInstances("svc");

			expect(mockBackend.getInstances).toHaveBeenCalledTimes(2); // initial read + refreshCache
			expect(result).toHaveLength(2);
		});

		it("should refresh cache on removeInstance", async () => {
			mockBackend.getInstances.mockResolvedValue([
				MAKE_INSTANCE("i-1"),
				MAKE_INSTANCE("i-2"),
			]);
			mockBackend.removeInstance.mockResolvedValue(true);

			await cachedBackend.getInstances("svc");

			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-2")]);
			await cachedBackend.removeInstance("svc", "i-1");

			const result = await cachedBackend.getInstances("svc");

			expect(result).toHaveLength(1);
			expect(mockBackend.getInstances).toHaveBeenCalledTimes(2); // initial read + refreshCache
		});

		it("should refresh cache on successful updateHeartbeat", async () => {
			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-1")]);
			mockBackend.updateHeartbeat.mockResolvedValue(30000);

			await cachedBackend.getInstances("svc");

			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-1")]);
			await cachedBackend.updateHeartbeat("svc", "i-1");

			await cachedBackend.getInstances("svc");

			expect(mockBackend.getInstances).toHaveBeenCalledTimes(2); // initial read + refreshCache
		});

		it("should not invalidate cache on failed updateHeartbeat", async () => {
			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-1")]);
			mockBackend.updateHeartbeat.mockResolvedValue(false);

			await cachedBackend.getInstances("svc");
			await cachedBackend.updateHeartbeat("svc", "i-1");

			const result = await cachedBackend.getInstances("svc");

			// Failed heartbeat → no refreshCache call, so cache still valid
			expect(mockBackend.getInstances).toHaveBeenCalledTimes(1);
			expect(result).toHaveLength(1);
		});
	});

	describe("eviction", () => {
		it("should evict oldest entry when maxEntries exceeded", async () => {
			mockBackend.getInstances.mockImplementation((name) => {
				if (name === "svc-a") {
					return Promise.resolve([MAKE_INSTANCE("i-1")]);
				}
				if (name === "svc-b") {
					return Promise.resolve([MAKE_INSTANCE("i-2")]);
				}
				if (name === "svc-c") {
					return Promise.resolve([MAKE_INSTANCE("i-3")]);
				}
				return Promise.resolve([MAKE_INSTANCE("i-4")]);
			});

			await cachedBackend.getInstances("svc-a");
			await cachedBackend.getInstances("svc-b");
			await cachedBackend.getInstances("svc-c");
			await cachedBackend.getInstances("svc-d");

			expect(mockBackend.getInstances).toHaveBeenCalledTimes(4);
			expect((cachedBackend as any)._cache.size).toBe(3);

			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-1")]);
			await cachedBackend.getInstances("svc-a");

			// svc-a was evicted, must re-fetch
			expect(mockBackend.getInstances).toHaveBeenCalledTimes(5);
		});
	});

	describe("getInstance", () => {
		it("should return from cache when available", async () => {
			const instance = MAKE_INSTANCE("i-1");
			mockBackend.getInstances.mockResolvedValue([instance]);

			await cachedBackend.getInstances("svc");
			const result = await cachedBackend.getInstance("svc", "i-1");

			expect(mockBackend.getInstance).not.toHaveBeenCalled();
			expect(result).toEqual(instance);
		});

		it("should fall through to backend when cache missed", async () => {
			mockBackend.getInstance.mockResolvedValue(MAKE_INSTANCE("i-1"));
			const result = await cachedBackend.getInstance("svc", "i-1");
			expect(mockBackend.getInstance).toHaveBeenCalledWith("svc", "i-1");
			expect(result).toBeDefined();
		});
	});

	describe("passthrough methods", () => {
		it("should delegate listServiceNames", async () => {
			mockBackend.listServiceNames.mockResolvedValue(["svc"]);
			const result = await cachedBackend.listServiceNames();
			expect(result).toEqual(["svc"]);
		});

		it("should delegate dump", async () => {
			mockBackend.dump.mockResolvedValue({ svc: [MAKE_INSTANCE("i-1")] });
			const result = await cachedBackend.dump();
			expect(result).toEqual({ svc: expect.any(Array) });
		});

		it("should delegate validInstanceToken", async () => {
			mockBackend.validInstanceToken.mockResolvedValue(true);
			const result = await cachedBackend.validInstanceToken("tok", "i-1");
			expect(result).toBe(true);
		});

		it("should delegate verifyInstanceName", () => {
			mockBackend.verifyInstanceName.mockReturnValue(true);
			const result = cachedBackend.verifyInstanceName("my-service");
			expect(result).toBe(true);
		});
	});

	describe("sweep", () => {
		it("should re-fetch on cache miss after TTL via lazy expiration", async () => {
			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-1")]);
			await cachedBackend.getInstances("svc");

			jest.advanceTimersByTime(60_000);

			const result = await cachedBackend.getInstances("svc");

			expect(mockBackend.getInstances).toHaveBeenCalledTimes(2);
			expect(result).toHaveLength(1);
			expect(result[0].instanceId).toBe("i-1");
		});
	});
});
