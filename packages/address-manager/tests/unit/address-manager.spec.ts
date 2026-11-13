import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { ServiceInstanceName } from "@trading-model/common/config/services.types";

jest.mock("@trading-model/http/adapters/outbound/http-client", () => ({
	HttpClient: {
		createWithTls: jest.fn<(...args: any[]) => any>().mockReturnValue({
			get: jest.fn<(...args: any[]) => any>(),
			post: jest.fn<(...args: any[]) => any>(),
		}),
	},
}));

jest.mock("@trading-model/http/infrastructure/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
		debug: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("@trading-model/common/utils/sleep", () => ({
	sleep: jest.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
}));

jest.mock("prom-client", () => ({
	Counter: jest.fn<(...args: any[]) => any>().mockReturnValue({
		inc: jest.fn<(...args: any[]) => any>(),
		reset: jest.fn<(...args: any[]) => any>(),
	}),
	Histogram: jest.fn<(...args: any[]) => any>().mockReturnValue({
		observe: jest.fn<(...args: any[]) => any>(),
		reset: jest.fn<(...args: any[]) => any>(),
	}),
	Gauge: jest.fn<(...args: any[]) => any>().mockReturnValue({
		set: jest.fn<(...args: any[]) => any>(),
		reset: jest.fn<(...args: any[]) => any>(),
	}),
	register: {
		clear: jest.fn<(...args: any[]) => any>(),
		contentType: "text/plain",
		metrics: jest
			.fn<(...args: any[]) => any>()
			.mockResolvedValue("metrics data"),
	},
}));

const MOCK_ADDRESS_MANAGER_CLIENT = (() => {
	const impl = {
		registerService: jest
			.fn<(...args: any[]) => any>()
			.mockResolvedValue({ token: "test-token" }),
		refreshTTL: jest.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
		unregisterService: jest
			.fn<(...args: any[]) => any>()
			.mockResolvedValue(undefined),
		hasIpChanged: jest.fn<(...args: any[]) => any>().mockReturnValue(false),
	};
	return impl;
})();
jest.mock("../../src/adapters/outbound/client/address-manager-client", () => ({
	AddressManagerClient: jest
		.fn<(...args: any[]) => any>()
		.mockReturnValue(MOCK_ADDRESS_MANAGER_CLIENT),
}));

const MOCK_TOKEN_MANAGER = (() => {
	const impl = {
		getTokenOrUndefined: jest
			.fn<(...args: any[]) => any>()
			.mockReturnValue(undefined),
		getToken: jest.fn<(...args: any[]) => any>().mockReturnValue("tok"),
		refreshToken: jest
			.fn<(...args: any[]) => any>()
			.mockResolvedValue(undefined),
		setToken: jest.fn<(...args: any[]) => any>(),
		clearToken: jest.fn<(...args: any[]) => any>(),
	};
	return impl;
})();
jest.mock("../../src/application/client/token-manager", () => ({
	TokenManager: jest
		.fn<(...args: any[]) => any>()
		.mockReturnValue(MOCK_TOKEN_MANAGER),
}));

jest.mock("../../src/adapters/outbound/discovery/service-cache", () => ({
	ServiceCache: jest.fn<(...args: any[]) => any>().mockReturnValue({
		get: jest.fn<(...args: any[]) => any>(),
		set: jest.fn<(...args: any[]) => any>(),
		delete: jest.fn<(...args: any[]) => any>(),
		clear: jest.fn<(...args: any[]) => any>(),
		entries: jest.fn<(...args: any[]) => any>().mockResolvedValue([]),
		close: jest.fn<(...args: any[]) => any>(),
	}),
}));

jest.mock("../../src/application/discovery/service-discovery", () => ({
	ServiceDiscovery: jest.fn<(...args: any[]) => any>().mockReturnValue({
		findService: jest.fn<(...args: any[]) => any>().mockResolvedValue({
			host: "127.0.0.1",
			port: 8080,
			instanceId: "i-1",
			serviceName: "test-service",
		}),
		findAllServices: jest.fn<(...args: any[]) => any>().mockResolvedValue([
			{
				host: "127.0.0.1",
				port: 8080,
				instanceId: "i-1",
				serviceName: "test-service",
			},
		]),
	}),
}));

jest.mock(
	"../../src/adapters/outbound/discovery/service-health-checker",
	() => ({
		ServiceHealthChecker: jest.fn<(...args: any[]) => any>().mockReturnValue({
			isHealthy: jest.fn<(...args: any[]) => any>().mockResolvedValue(true),
			locate: jest.fn((instance: { host: string }) => instance.host),
			recordLatency: jest.fn<(...args: any[]) => any>(),
		}),
	})
);

import {
	DurationMs,
	FilePath,
	IPAddress,
	Port,
	toInstanceId,
	toServiceId,
} from "@trading-model/primitives/primitives";
import AddressManager from "../../src/application/address-manager";
import type { AddressManagerConfig } from "../../src/domain/config/address-manager-config";

function makeConfig(
	overrides?: Partial<AddressManagerConfig>
): AddressManagerConfig {
	return {
		servicePort: Port.of(8080),
		addressManagerUrl: "https://discovery:3000",
		cacheTtlMs: DurationMs.of(30000),
		servicePingTimeoutMs: DurationMs.of(2000),
		discoveryTimeoutMs: DurationMs.of(5000),
		tokenRefreshIntervalMs: DurationMs.of(60000),
		ttlRefreshIntervalMs: DurationMs.of(15000),
		identity: {
			serviceName: toServiceId("test-service"),
			instanceId: toInstanceId("instance-1"),
		},
		tls: {
			caPath: FilePath.of("/path/to/ca.pem"),
			certPath: FilePath.of("/path/to/cert.pem"),
			keyPath: FilePath.of("/path/to/key.pem"),
		},
		...overrides,
	};
}

describe("AddressManager (main)", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		MOCK_TOKEN_MANAGER.getTokenOrUndefined.mockReturnValue(undefined);
		MOCK_ADDRESS_MANAGER_CLIENT.registerService.mockResolvedValue({
			token: "test-token",
		});
		MOCK_ADDRESS_MANAGER_CLIENT.refreshTTL.mockResolvedValue(undefined);
		MOCK_ADDRESS_MANAGER_CLIENT.unregisterService.mockResolvedValue(undefined);
		MOCK_ADDRESS_MANAGER_CLIENT.hasIpChanged.mockReturnValue(false);
	});

	it("should create instance with minimal config", () => {
		const am = new AddressManager(makeConfig());
		expect(am).toBeInstanceOf(AddressManager);
	});

	it("should create instance with DNS name map", () => {
		const am = new AddressManager(
			makeConfig({
				dnsNameMap: {
					[toServiceId("test-service")]: IPAddress.of("127.0.0.1"),
				},
			})
		);
		expect(am).toBeInstanceOf(AddressManager);
	});

	it("should find a service", async () => {
		const am = new AddressManager(makeConfig());
		const instance = await am.discoveryOrchestrator.findService(
			toServiceId("test-service") as unknown as ServiceInstanceName
		);
		expect(instance).toBeDefined();
	});

	it("should start and stop", async () => {
		const am = new AddressManager(makeConfig());
		const handle = am.lifecycleManager.start();
		handle.stop();
	});

	it("should find all services", async () => {
		const am = new AddressManager(makeConfig());
		const instances = await am.discoveryOrchestrator.findAllServices(
			toServiceId("test-service") as unknown as ServiceInstanceName
		);
		expect(instances).toHaveLength(1);
		expect(instances[0].serviceName).toBe("test-service");
	});

	it("should record call success without durationMs", () => {
		const am = new AddressManager(makeConfig());
		am.discoveryOrchestrator.recordCallSuccess(toInstanceId("instance-1"));
	});

	it("should record call success with durationMs", () => {
		const am = new AddressManager(makeConfig());
		am.discoveryOrchestrator.recordCallSuccess(toInstanceId("instance-1"), 42);
	});

	it("should record call failure without durationMs", () => {
		const am = new AddressManager(makeConfig());
		am.discoveryOrchestrator.recordCallFailure(toInstanceId("instance-1"));
	});

	it("should record call failure with durationMs", () => {
		const am = new AddressManager(makeConfig());
		am.discoveryOrchestrator.recordCallFailure(toInstanceId("instance-1"), 100);
	});

	it("recordCallSuccess / recordCallFailure delegate to the orchestrator", () => {
		const am = new AddressManager(makeConfig());
		const success = jest.spyOn(am.discoveryOrchestrator, "recordCallSuccess");
		const failure = jest.spyOn(am.discoveryOrchestrator, "recordCallFailure");
		am.recordCallSuccess(toInstanceId("i-1"), 5);
		am.recordCallFailure(toInstanceId("i-1"), 7);
		expect(success).toHaveBeenCalledWith(toInstanceId("i-1"), 5);
		expect(failure).toHaveBeenCalledWith(toInstanceId("i-1"), 7);
	});

	it("should get metrics", () => {
		const am = new AddressManager(makeConfig());
		const metrics = am.metricsCollector.getMetrics();
		expect(metrics).toHaveProperty("memory");
		expect(metrics).toHaveProperty("cpu");
	});

	it("should listen on express app", () => {
		const am = new AddressManager(makeConfig());
		const app = {
			use: jest.fn<(...args: any[]) => any>(),
			get: jest.fn<(...args: any[]) => any>(),
			locals: {} as Record<string, unknown>,
		};
		am.metricsCollector.listenExpress(app as any);
		expect(app.use).toHaveBeenCalled();
		expect(app.get).toHaveBeenCalledWith("/metrics", expect.any(Function));
	});

	it("should handle start already started", async () => {
		const am = new AddressManager(makeConfig());
		const handle1 = am.lifecycleManager.start();
		const handle2 = am.lifecycleManager.start();
		handle1.stop();
		handle2.stop();
	});

	it("should leave the registry, then stop", async () => {
		const am = new AddressManager(makeConfig());
		const handle = am.lifecycleManager.start();
		await handle.ready;
		await handle.leave();
		expect(MOCK_ADDRESS_MANAGER_CLIENT.unregisterService).toHaveBeenCalledTimes(
			1
		);
		handle.stop();
	});

	it("should complete registration before stopping", async () => {
		const am = new AddressManager(makeConfig());
		const handle = am.lifecycleManager.start();
		await handle.ready;
		handle.stop();
	});

	it("should not crash on start with existing token (sticky registration)", async () => {
		MOCK_TOKEN_MANAGER.getTokenOrUndefined.mockReturnValue("existing-token");
		MOCK_ADDRESS_MANAGER_CLIENT.refreshTTL.mockResolvedValue(undefined);
		const am = new AddressManager(makeConfig());
		const handle = am.lifecycleManager.start();
		handle.stop();
	});

	it("should return token from getToken", () => {
		const am = new AddressManager(makeConfig());
		const token = am.tokenManager.getToken();
		expect(token).toBe("tok");
	});

	it("should retry findService when circuit breaker is open", async () => {
		MOCK_TOKEN_MANAGER.getTokenOrUndefined.mockReturnValue("existing-token");
		MOCK_ADDRESS_MANAGER_CLIENT.refreshTTL.mockResolvedValue(undefined);
		const am = new AddressManager(makeConfig());

		am.discoveryOrchestrator.recordCallFailure(toInstanceId("i-1"));
		am.discoveryOrchestrator.recordCallFailure(toInstanceId("i-1"));
		am.discoveryOrchestrator.recordCallFailure(toInstanceId("i-1"));

		await expect(
			am.discoveryOrchestrator.findService(
				toServiceId("test-service") as unknown as ServiceInstanceName
			)
		).rejects.toThrow();
	});
});
