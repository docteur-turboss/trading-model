import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn(),
	Redis: jest.fn(),
}));

const mockGetMetadata = jest.fn();
const mockGetServiceInstanceIds = jest.fn();
const mockGetMetadatas = jest.fn();
const mockListServiceNames = jest.fn();

jest.mock("../../src/core/instance-metadata-reader", () => ({
	InstanceMetadataReader: jest.fn().mockImplementation(() => ({
		getMetadata: mockGetMetadata,
		getServiceInstanceIds: mockGetServiceInstanceIds,
		getMetadatas: mockGetMetadatas,
		listServiceNames: mockListServiceNames,
	})),
}));

const mockResolveToken = jest.fn();
const mockBuildStoredInstance = jest.fn();
const mockRegisterInstance = jest.fn();

jest.mock("../../src/core/instance-registrar", () => ({
	InstanceRegistrar: jest.fn().mockImplementation(() => ({
		resolveToken: mockResolveToken,
		buildStoredInstance: mockBuildStoredInstance,
		registerInstance: mockRegisterInstance,
	})),
}));

const mockHeartbeatUpdate = jest.fn();

jest.mock("../../src/core/instance-heartbeat-handler", () => ({
	InstanceHeartbeatHandler: jest.fn().mockImplementation(() => ({
		updateHeartbeat: mockHeartbeatUpdate,
	})),
}));

const mockRemoveInstanceSetAndMetadata = jest.fn();

jest.mock("../../src/core/instance-cleanup-handler", () => ({
	removeInstanceSetAndMetadata: mockRemoveInstanceSetAndMetadata,
}));

import type { ServiceInstance } from "@trading-model/validation/contracts/service-registry.types";
import type { RedisDeps } from "../../src/core/redis-deps";
import { RedisInstanceStore } from "../../src/core/redis-instance-store";

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		serviceName: "financial-scraper-service",
		instanceId: "test-instance-1",
		host: "192.168.1.10",
		port: 8444,
		version: "1.0.0",
		ttl: 30_000,
		protocol: "mtls",
		registeredAt: Date.now() - 1000,
		lastHeartbeat: Date.now() - 500,
		...overrides,
	};
}

describe("RedisInstanceStore", () => {
	let store: RedisInstanceStore;
	let deps: RedisDeps;

	beforeEach(() => {
		jest.clearAllMocks();

		deps = {
			redis: {} as never,
			keyBuilder: {
				instanceMetadata: jest.fn().mockReturnValue("instance:i1:metadata"),
			} as never,
			tokenService: {} as never,
		};

		store = new RedisInstanceStore(deps);
	});

	describe("constructor", () => {
		it("should create internal components with deps", () => {
			expect(store).toBeInstanceOf(RedisInstanceStore);
		});
	});

	describe("resolveToken", () => {
		it("should delegate to registrar.resolveToken", async () => {
			mockResolveToken.mockResolvedValue("resolved-token");

			const result = await store.registrar.resolveToken("i1" as never);

			expect(mockResolveToken).toHaveBeenCalledWith("i1");
			expect(result).toBe("resolved-token");
		});
	});

	describe("buildStoredInstance", () => {
		it("should delegate to registrar.buildStoredInstance", async () => {
			const instance = makeInstance();
			const now = Date.now();
			mockBuildStoredInstance.mockResolvedValue(instance);

			const result = await store.registrar.buildStoredInstance(instance, now);

			expect(mockBuildStoredInstance).toHaveBeenCalledWith(instance, now);
			expect(result).toBe(instance);
		});
	});

	describe("getMetadata", () => {
		it("should delegate to reader.getMetadata", async () => {
			const instance = makeInstance();
			mockGetMetadata.mockResolvedValue(instance);

			const result = await store.reader.getMetadata("i1" as never);

			expect(mockGetMetadata).toHaveBeenCalledWith("i1");
			expect(result).toBe(instance);
		});
	});

	describe("getServiceInstanceIds", () => {
		it("should delegate to reader.getServiceInstanceIds", async () => {
			mockGetServiceInstanceIds.mockResolvedValue(["i1", "i2"]);

			const result = await store.reader.getServiceInstanceIds(
				"financial-scraper-service" as never
			);

			expect(mockGetServiceInstanceIds).toHaveBeenCalledWith(
				"financial-scraper-service"
			);
			expect(result).toEqual(["i1", "i2"]);
		});
	});

	describe("getMetadatas", () => {
		it("should delegate to reader.getMetadatas", async () => {
			const instances = [makeInstance()];
			mockGetMetadatas.mockResolvedValue(instances);

			const result = await store.reader.getMetadatas(["key1"]);

			expect(mockGetMetadatas).toHaveBeenCalledWith(["key1"]);
			expect(result).toBe(instances);
		});
	});

	describe("getInstance", () => {
		it("should delegate to getMetadata", async () => {
			const instance = makeInstance();
			mockGetMetadata.mockResolvedValue(instance);

			const result = await store.getInstance({
				serviceName: "svc" as never,
				instanceId: "i1" as never,
			});

			expect(mockGetMetadata).toHaveBeenCalledWith("i1");
			expect(result).toBe(instance);
		});
	});

	describe("getInstances", () => {
		it("should return empty array when no instance IDs exist", async () => {
			mockGetServiceInstanceIds.mockResolvedValue([]);

			const result = await store.getInstances(
				"financial-scraper-service" as never
			);

			expect(result).toEqual([]);
		});

		it("should return instances from metadata when IDs exist", async () => {
			mockGetServiceInstanceIds.mockResolvedValue(["i1"]);
			const instance = makeInstance();
			mockGetMetadatas.mockResolvedValue([instance]);

			const result = await store.getInstances(
				"financial-scraper-service" as never
			);

			expect(mockGetMetadatas).toHaveBeenCalled();
			expect(result).toEqual([instance]);
		});
	});

	describe("registerInstance", () => {
		it("should delegate to registrar.registerInstance", async () => {
			const instance = makeInstance();
			mockRegisterInstance.mockResolvedValue("token");

			const result = await store.registerInstance(instance);

			expect(mockRegisterInstance).toHaveBeenCalledWith(instance);
			expect(result).toBe("token");
		});
	});

	describe("updateHeartbeat", () => {
		it("should delegate to heartbeatHandler.updateHeartbeat", async () => {
			mockHeartbeatUpdate.mockResolvedValue(30000);

			const result = await store.updateHeartbeat({
				serviceName: "svc" as never,
				instanceId: "i1" as never,
			});

			expect(mockHeartbeatUpdate).toHaveBeenCalledWith({
				serviceName: "svc",
				instanceId: "i1",
			});
			expect(result).toBe(30000);
		});
	});

	describe("removeInstanceSetAndMetadata", () => {
		it("should delegate to removeInstanceSetAndMetadata", async () => {
			mockRemoveInstanceSetAndMetadata.mockResolvedValue(true);

			const result = await store.removeInstanceSetAndMetadata({
				serviceName: "financial-scraper-service" as never,
				instanceId: "i1" as never,
			});

			expect(mockRemoveInstanceSetAndMetadata).toHaveBeenCalled();
			expect(result).toBe(true);
		});
	});

	describe("removeInstance", () => {
		it("should delegate to removeInstanceSetAndMetadata", async () => {
			mockRemoveInstanceSetAndMetadata.mockResolvedValue(true);

			const result = await store.removeInstance({
				serviceName: "svc" as never,
				instanceId: "i1" as never,
			});

			expect(mockRemoveInstanceSetAndMetadata).toHaveBeenCalled();
			expect(result).toBe(true);
		});
	});

	describe("listServiceNames", () => {
		it("should delegate to reader.listServiceNames", async () => {
			mockListServiceNames.mockResolvedValue(["financial-scraper-service"]);

			const result = await store.listServiceNames();

			expect(mockListServiceNames).toHaveBeenCalled();
			expect(result).toEqual(["financial-scraper-service"]);
		});
	});

	describe("dump", () => {
		it("should return empty snapshot when no services exist", async () => {
			mockListServiceNames.mockResolvedValue([]);

			const snapshot = await store.dump();

			expect(snapshot).toEqual({});
		});

		it("should return snapshot of all instances grouped by service", async () => {
			const instances = [makeInstance()];
			mockListServiceNames.mockResolvedValue([
				"financial-scraper-service" as never,
			]);
			mockGetServiceInstanceIds.mockResolvedValue(["i1"]);
			mockGetMetadatas.mockResolvedValue(instances);

			const snapshot = await store.dump();

			expect(snapshot["financial-scraper-service"]).toHaveLength(1);
			expect(snapshot["financial-scraper-service"]![0]).toBe(instances[0]);
		});
	});
});
