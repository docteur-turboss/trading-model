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
} from "@trading-model/validation/contracts/service-registry.types";
import { CachedRegistryOperations } from "../../src/core/cached-registry-operations";

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

const _MAKE_INSTANCE = (id: string): ServiceInstance => ({
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

describe("CachedRegistryOperations", () => {
	let mockBackend: jest.Mocked<RegistryBackend>;
	let operations: CachedRegistryOperations;

	beforeEach(() => {
		jest.useFakeTimers();
		mockBackend = createMockBackend();
		operations = new CachedRegistryOperations({
			backend: mockBackend,
			cacheTtlMs: 5000,
			redisUrlForPubSub: undefined,
			maxEntries: 10,
		});
	});

	afterEach(() => {
		operations.stop();
		jest.useRealTimers();
	});

	describe("start", () => {
		it("should start the lifecycle", async () => {
			const spy = jest.spyOn((operations as any)._lifecycle, "start" as string);
			await operations.start();
			expect(spy).toHaveBeenCalled();
		});
	});

	describe("stop", () => {
		it("should stop the lifecycle", () => {
			const spy = jest.spyOn((operations as any)._lifecycle, "stop" as string);
			operations.stop();
			expect(spy).toHaveBeenCalled();
		});
	});

	describe("updateToken", () => {
		it("should delegate updateToken to the proxy", async () => {
			mockBackend.updateToken.mockResolvedValue("new-token");
			const result = await operations.updateToken("i-1");
			expect(result).toBe("new-token");
			expect(mockBackend.updateToken).toHaveBeenCalledWith("i-1");
		});
	});

	describe("generateInstanceToken", () => {
		it("should delegate generateInstanceToken to the proxy", () => {
			mockBackend.generateInstanceToken.mockReturnValue("tok");
			const result = operations.generateInstanceToken("i-1");
			expect(result).toBe("tok");
		});
	});

	describe("verifyInstanceName", () => {
		it("should delegate verifyInstanceName to the proxy", () => {
			mockBackend.verifyInstanceName.mockReturnValue(true);
			const result = operations.verifyInstanceName("my-service");
			expect(result).toBe(true);
		});
	});

	describe("generateInstanceId", () => {
		it("should delegate generateInstanceId to the proxy", () => {
			const endpoint = {
				host: "127.0.0.1",
				port: 8080,
				protocol: "http",
			} as any;
			mockBackend.generateInstanceId.mockReturnValue("svc-id");
			const result = operations.generateInstanceId(endpoint);
			expect(result).toBe("svc-id");
		});
	});
});
