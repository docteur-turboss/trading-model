import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { Protocol } from "@trading-model/contracts/service-registry-types";
import type {
	DurationMs,
	InstanceId,
	IPAddress,
	Port,
	ServiceId,
	UnixTimestamp,
	Version,
} from "@trading-model/primitives/primitives";

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
		debug: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("ioredis", () => ({
	__esModule: true,
	default: jest.fn<(...args: any[]) => any>(),
	Redis: jest.fn<(...args: any[]) => any>(),
}));

const mockGetMetadata = jest.fn<(...args: any[]) => any>();
const mockGetServiceInstanceIds = jest.fn<(...args: any[]) => any>();
const mockGetMetadatas = jest.fn<(...args: any[]) => any>();
const mockListServiceNames = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/adapters/outbound/instance-metadata-reader", () => ({
	InstanceMetadataReader: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => ({
			getMetadata: mockGetMetadata,
			getServiceInstanceIds: mockGetServiceInstanceIds,
			getMetadatas: mockGetMetadatas,
			listServiceNames: mockListServiceNames,
		})),
}));

const mockBuildStoredInstance = jest.fn<(...args: any[]) => any>();
const mockRegisterInstance = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/adapters/outbound/instance-registrar", () => ({
	InstanceRegistrar: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => ({
			buildStoredInstance: mockBuildStoredInstance,
			registerInstance: mockRegisterInstance,
		})),
}));

const mockHeartbeatUpdate = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/adapters/outbound/instance-heartbeat-handler", () => ({
	InstanceHeartbeatHandler: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => ({
			updateHeartbeat: mockHeartbeatUpdate,
		})),
}));

const mockRemoveInstanceSetAndMetadata = jest.fn<(...args: any[]) => any>();

jest.mock("../../src/adapters/outbound/instance-cleanup-handler", () => ({
	removeInstanceSetAndMetadata: mockRemoveInstanceSetAndMetadata,
}));

import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import { RedisInstanceStore } from "../../src/adapters/outbound/redis-instance-store";
import type { RedisDeps } from "../../src/shared/redis-deps";

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		serviceName: "financial-scraper" as ServiceId,
		instanceId: "test-instance-1" as InstanceId,
		host: "192.168.1.10" as IPAddress,
		port: 8444 as Port,
		version: "1.0.0" as Version,
		ttl: 30_000 as DurationMs,
		protocol: "mtls" as unknown as Protocol,
		registeredAt: (Date.now() - 1000) as UnixTimestamp,
		lastHeartbeat: (Date.now() - 500) as UnixTimestamp,
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
			keyPrefix: "",
		} as never;

		store = new RedisInstanceStore(deps);
	});

	describe("constructor", () => {
		it("should create internal components with deps", () => {
			expect(store).toBeInstanceOf(RedisInstanceStore);
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
				"financial-scraper" as never
			);

			expect(mockGetServiceInstanceIds).toHaveBeenCalledWith(
				"financial-scraper"
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

			const result = await store.getInstances("financial-scraper" as never);

			expect(result).toEqual([]);
		});

		it("should return instances from metadata when IDs exist", async () => {
			mockGetServiceInstanceIds.mockResolvedValue(["i1"]);
			const instance = makeInstance();
			mockGetMetadatas.mockResolvedValue([instance]);

			const result = await store.getInstances("financial-scraper" as never);

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
			mockListServiceNames.mockResolvedValue(["financial-scraper"]);

			const result = await store.listServiceNames();

			expect(mockListServiceNames).toHaveBeenCalled();
			expect(result).toEqual(["financial-scraper"]);
		});
	});
});
