import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/validation/contracts/service-registry.types";
import { CachedRegistryBackendProxy } from "../../src/core/cached-registry-backend-proxy";

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
	} as jest.Mocked<RegistryBackend>;
}

const MAKE_INSTANCE = (id: string): ServiceInstance => ({
	serviceName: "financial-scraper-service",
	instanceId: id,
	host: "127.0.0.1",
	port: 8080,
	protocol: "http",
	lastHeartbeat: Date.now(),
	registeredAt: Date.now(),
	version: "1.0.0",
	ttl: 30000,
});

describe("CachedRegistryBackendProxy", () => {
	let mockBackend: jest.Mocked<RegistryBackend>;
	let proxy: CachedRegistryBackendProxy;

	beforeEach(() => {
		mockBackend = createMockBackend();
		proxy = new CachedRegistryBackendProxy(mockBackend);
	});

	describe("updateToken", () => {
		it("should delegate to backend with instanceId", async () => {
			mockBackend.updateToken.mockResolvedValue("new-token");
			const result = await proxy.updateToken("i-1");
			expect(mockBackend.updateToken).toHaveBeenCalledWith("i-1");
			expect(result).toBe("new-token");
		});
	});

	describe("getInstanceCount", () => {
		it("should return instance count from backend", async () => {
			mockBackend.getInstances.mockResolvedValue([
				MAKE_INSTANCE("i-1"),
				MAKE_INSTANCE("i-2"),
			]);
			const result = await proxy.getInstanceCount("financial-scraper-service");
			expect(mockBackend.getInstances).toHaveBeenCalledWith(
				"financial-scraper-service"
			);
			expect(result).toBe(2);
		});

		it("should return 0 when no instances exist", async () => {
			mockBackend.getInstances.mockResolvedValue([]);
			const result = await proxy.getInstanceCount("financial-scraper-service");
			expect(result).toBe(0);
		});
	});

	describe("getServiceVersion", () => {
		it("should return max major version from instances", async () => {
			mockBackend.getInstances.mockResolvedValue([
				MAKE_INSTANCE("i-1"),
				{ ...MAKE_INSTANCE("i-2"), version: "2.0.0" },
				{ ...MAKE_INSTANCE("i-3"), version: "1.5.0" },
			]);
			const result = await proxy.getServiceVersion("financial-scraper-service");
			expect(result).toBe(2);
		});

		it("should return 0 when instances have undefined versions", async () => {
			mockBackend.getInstances.mockResolvedValue([
				{ ...MAKE_INSTANCE("i-1"), version: undefined },
			]);
			const result = await proxy.getServiceVersion("financial-scraper-service");
			expect(result).toBe(0);
		});

		it("should return 0 when version string has non-numeric major", async () => {
			mockBackend.getInstances.mockResolvedValue([
				{ ...MAKE_INSTANCE("i-1"), version: "abc.def" },
			]);
			const result = await proxy.getServiceVersion("financial-scraper-service");
			expect(result).toBe(0);
		});

		it("should return 0 when no instances exist", async () => {
			mockBackend.getInstances.mockResolvedValue([]);
			const result = await proxy.getServiceVersion("financial-scraper-service");
			expect(result).toBe(0);
		});
	});

	describe("listServiceNames", () => {
		it("should delegate to backend", async () => {
			mockBackend.listServiceNames.mockResolvedValue(["svc-a", "svc-b"]);
			const result = await proxy.listServiceNames();
			expect(result).toEqual(["svc-a", "svc-b"]);
		});
	});

	describe("dump", () => {
		it("should delegate to backend", async () => {
			const dumpData: Record<string, ServiceInstance[]> = {
				svc: [MAKE_INSTANCE("i-1")],
			};
			mockBackend.dump.mockResolvedValue(dumpData);
			const result = await proxy.dump();
			expect(result).toEqual(dumpData);
		});
	});

	describe("validInstanceToken", () => {
		it("should delegate to backend", async () => {
			mockBackend.validInstanceToken.mockResolvedValue(true);
			const result = await proxy.validInstanceToken({
				token: "tok",
				instanceId: "i-1",
			});
			expect(result).toBe(true);
		});

		it("should return false when backend returns false", async () => {
			mockBackend.validInstanceToken.mockResolvedValue(false);
			const result = await proxy.validInstanceToken({
				token: "bad",
				instanceId: "i-1",
			});
			expect(result).toBe(false);
		});
	});

	describe("generateInstanceToken", () => {
		it("should delegate to backend", () => {
			mockBackend.generateInstanceToken.mockReturnValue("generated-token");
			const result = proxy.generateInstanceToken("i-1");
			expect(result).toBe("generated-token");
		});
	});

	describe("verifyInstanceName", () => {
		it("should delegate to backend", () => {
			mockBackend.verifyInstanceName.mockReturnValue(true);
			const result = proxy.verifyInstanceName("my-service");
			expect(result).toBe(true);
		});

		it("should return false when backend returns false", () => {
			mockBackend.verifyInstanceName.mockReturnValue(false);
			const result = proxy.verifyInstanceName("unknown-service");
			expect(result).toBe(false);
		});
	});

	describe("generateInstanceId", () => {
		it("should delegate to backend", () => {
			const endpoint = {
				host: "127.0.0.1",
				port: 8080,
				protocol: "http",
			} as any;
			mockBackend.generateInstanceId.mockReturnValue("svc-id");
			const result = proxy.generateInstanceId(endpoint);
			expect(result).toBe("svc-id");
		});
	});
});
