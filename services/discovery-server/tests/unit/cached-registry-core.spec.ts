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
} from "@trading-model/validation/adapters/outbound/service-registry.types";
import { CachedRegistryCore } from "../../src/application/cached-registry-core";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

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

const A_SERVICE = "financial-scraper-service";

const MAKE_INSTANCE = (id: string): ServiceInstance => ({
	serviceName: A_SERVICE,
	instanceId: id,
	host: "127.0.0.1",
	port: 8080,
	protocol: "http",
	lastHeartbeat: Date.now(),
	registeredAt: Date.now(),
	version: "1.0.0",
	ttl: 30000,
});

describe("CachedRegistryCore", () => {
	let mockBackend: jest.Mocked<RegistryBackend>;
	let core: CachedRegistryCore;

	beforeEach(() => {
		jest.useFakeTimers();
		mockBackend = createMockBackend();
		core = new CachedRegistryCore({
			backend: mockBackend,
			cacheTtlMs: 5000,
			redisUrlForPubSub: undefined,
			maxEntries: 10,
		});
	});

	afterEach(() => {
		core.healthMonitor.stop();
		jest.useRealTimers();
	});

	describe("constructor", () => {
		it("should create internal components with default options", () => {
			expect(core.cache).toBeDefined();
			expect(core.pubSub).toBeDefined();
			expect(core.pingManager).toBeDefined();
			expect(core.healthMonitor).toBeDefined();
			expect(core.orchestrator).toBeDefined();
		});
	});

	describe("registerInstance", () => {
		it("should register, refresh cache, and publish", async () => {
			const instance = MAKE_INSTANCE("i-1");
			mockBackend.registerInstance.mockResolvedValue("token-1");
			mockBackend.getInstances.mockResolvedValue([instance]);

			const spyRefresh = jest.spyOn(core.orchestrator, "refreshCache");
			const spyPublish = jest.spyOn(core.pubSub, "publish");

			const token = await core.registerInstance(instance);

			expect(mockBackend.registerInstance).toHaveBeenCalledWith(instance);
			expect(spyRefresh).toHaveBeenCalledWith(A_SERVICE);
			expect(spyPublish).toHaveBeenCalledWith(A_SERVICE);
			expect(token).toBe("token-1");
		});
	});

	describe("updateHeartbeat", () => {
		it("should update heartbeat and refresh cache when successful", async () => {
			const id = { serviceName: A_SERVICE, instanceId: "i-1" };
			mockBackend.updateHeartbeat.mockResolvedValue(30000);
			mockBackend.getInstances.mockResolvedValue([MAKE_INSTANCE("i-1")]);

			const spyRefresh = jest.spyOn(core.orchestrator, "refreshCache");
			const spyHeartbeat = jest.spyOn(core.orchestrator, "onHeartbeatUpdate");

			const result = await core.updateHeartbeat(id);

			expect(mockBackend.updateHeartbeat).toHaveBeenCalledWith(id);
			expect(spyRefresh).toHaveBeenCalledWith(A_SERVICE);
			expect(spyHeartbeat).toHaveBeenCalled();
			expect(result).toBe(30000);
		});

		it("should not refresh cache when updateHeartbeat returns false", async () => {
			const id = { serviceName: A_SERVICE, instanceId: "i-1" };
			mockBackend.updateHeartbeat.mockResolvedValue(false);

			const spyRefresh = jest.spyOn(core.orchestrator, "refreshCache");

			const result = await core.updateHeartbeat(id);

			expect(spyRefresh).not.toHaveBeenCalled();
			expect(result).toBe(false);
		});
	});

	describe("getInstances", () => {
		it("should delegate to orchestrator fetcher", async () => {
			const instances = [MAKE_INSTANCE("i-1")];
			mockBackend.getInstances.mockResolvedValue(instances);

			const result = await core.orchestrator.fetcher.getInstances(A_SERVICE);

			expect(result).toEqual(instances);
		});

		it("should pass pagination to fetcher", async () => {
			const spy = jest.spyOn(core.orchestrator.fetcher, "getInstances");
			mockBackend.getInstances.mockResolvedValue([]);

			await core.orchestrator.fetcher.getInstances(A_SERVICE, {
				page: 1,
				limit: 10,
			});

			expect(spy).toHaveBeenCalledWith(A_SERVICE, { page: 1, limit: 10 });
		});
	});

	describe("getInstance", () => {
		it("should return instance from cache", async () => {
			const instance = MAKE_INSTANCE("i-1");
			mockBackend.getInstances.mockResolvedValue([instance]);
			await core.orchestrator.fetcher.getInstances(A_SERVICE);

			const result = await core.orchestrator.fetcher.getInstance({
				serviceName: A_SERVICE,
				instanceId: "i-1",
			});

			expect(result).toEqual(instance);
		});
	});

	describe("removeInstance", () => {
		it("should remove, refresh cache, and publish", async () => {
			const id = { serviceName: A_SERVICE, instanceId: "i-1" };
			mockBackend.removeInstance.mockResolvedValue(true);
			mockBackend.getInstances.mockResolvedValue([]);

			const spyRefresh = jest.spyOn(core.orchestrator, "refreshCache");
			const spyPublish = jest.spyOn(core.pubSub, "publish");

			const result = await core.removeInstance(id);

			expect(mockBackend.removeInstance).toHaveBeenCalledWith(id);
			expect(spyRefresh).toHaveBeenCalledWith(A_SERVICE);
			expect(spyPublish).toHaveBeenCalledWith(A_SERVICE);
			expect(result).toBe(true);
		});
	});
});
