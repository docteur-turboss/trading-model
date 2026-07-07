import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/http-client", () => ({
	HttpClient: {
		createWithTls: jest.fn<any>().mockReturnValue({
			get: jest.fn<any>(),
			post: jest.fn<any>(),
		}),
	},
}));

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn<any>(),
		warn: jest.fn<any>(),
		error: jest.fn<any>(),
		debug: jest.fn<any>(),
	},
}));

jest.mock("@trading-model/common/utils/sleep", () => ({
	sleep: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("prom-client", () => ({
	Counter: jest
		.fn<any>()
		.mockReturnValue({ inc: jest.fn<any>(), reset: jest.fn<any>() }),
	Histogram: jest
		.fn<any>()
		.mockReturnValue({ observe: jest.fn<any>(), reset: jest.fn<any>() }),
	Gauge: jest
		.fn<any>()
		.mockReturnValue({ set: jest.fn<any>(), reset: jest.fn<any>() }),
	register: {
		clear: jest.fn<any>(),
		contentType: "text/plain",
		metrics: jest.fn<any>().mockResolvedValue("metrics data"),
	},
}));

const MOCK_ADDRESS_MANAGER_CLIENT = (() => {
	const impl = {
		registerService: jest.fn<any>().mockResolvedValue({ token: "test-token" }),
		refreshTTL: jest.fn<any>().mockResolvedValue(undefined),
		unregisterService: jest.fn<any>().mockResolvedValue(undefined),
		hasIpChanged: jest.fn<any>().mockReturnValue(false),
	};
	return impl;
})();
jest.mock("../../src/client/address-manager-client", () => ({
	AddressManagerClient: jest
		.fn<any>()
		.mockReturnValue(MOCK_ADDRESS_MANAGER_CLIENT),
}));

const MOCK_TOKEN_MANAGER = (() => {
	const impl = {
		getTokenOrUndefined: jest.fn<any>().mockReturnValue(undefined),
		getToken: jest.fn<any>().mockReturnValue("tok"),
		refreshToken: jest.fn<any>().mockResolvedValue(undefined),
		setToken: jest.fn<any>(),
		clearToken: jest.fn<any>(),
	};
	return impl;
})();
jest.mock("../../src/client/token-manager", () => ({
	TokenManager: jest.fn<any>().mockReturnValue(MOCK_TOKEN_MANAGER),
}));

jest.mock("../../src/discovery/redis-service-cache", () => ({
	RedisServiceCache: jest.fn<any>().mockReturnValue({
		get: jest.fn<any>(),
		set: jest.fn<any>(),
		invalidate: jest.fn<any>(),
		clear: jest.fn<any>(),
		entries: jest.fn<any>().mockResolvedValue([]),
		stop: jest.fn<any>(),
		getVersion: jest.fn<any>().mockResolvedValue(0),
		setCircuitState: jest.fn<any>().mockResolvedValue(undefined),
		getCircuitState: jest.fn<any>().mockResolvedValue(null),
		deleteCircuitState: jest.fn<any>().mockResolvedValue(undefined),
	}),
}));

jest.mock("../../src/discovery/service-cache", () => ({
	ServiceCache: jest.fn<any>().mockReturnValue({
		get: jest.fn<any>(),
		set: jest.fn<any>(),
		invalidate: jest.fn<any>(),
		clear: jest.fn<any>(),
		entries: jest.fn<any>().mockResolvedValue([]),
		stop: jest.fn<any>(),
		getVersion: jest.fn<any>().mockResolvedValue(0),
		setCircuitState: jest.fn<any>().mockResolvedValue(undefined),
		getCircuitState: jest.fn<any>().mockResolvedValue(null),
		deleteCircuitState: jest.fn<any>().mockResolvedValue(undefined),
	}),
}));

jest.mock("../../src/discovery/service-discovery", () => ({
	ServiceDiscovery: jest.fn<any>().mockReturnValue({
		findService: jest.fn<any>().mockResolvedValue({
			ip: "127.0.0.1",
			port: 8080,
			instanceId: "i-1",
			serviceName: "test-service",
		}),
		findAllServices: jest.fn<any>().mockResolvedValue([
			{
				ip: "127.0.0.1",
				port: 8080,
				instanceId: "i-1",
				serviceName: "test-service",
			},
		]),
		acquireConnection: jest.fn<any>(),
		releaseConnection: jest.fn<any>(),
	}),
}));

jest.mock("../../src/discovery/service-health-checker", () => ({
	ServiceHealthChecker: jest.fn<any>().mockReturnValue({
		isHealthy: jest.fn<any>().mockResolvedValue(true),
		recordLatency: jest.fn<any>(),
	}),
}));

jest.mock("../../src/client/websocket-client", () => ({
	WebSocketClient: jest.fn<any>().mockReturnValue({
		connect: jest.fn<any>(),
		disconnect: jest.fn<any>(),
		onMessage: jest.fn<any>(),
		setHttpFallback: jest.fn<any>(),
		onAuthFailure: jest.fn<any>(),
		isConnected: jest.fn<any>().mockReturnValue(false),
		sendHeartbeat: jest.fn<any>().mockReturnValue(false),
		updateToken: jest.fn<any>(),
	}),
}));

import AddressManager from "../../src/address-manager";
import type { AddressManagerConfig } from "../../src/config/address-manager-config";

function makeConfig(
	overrides?: Partial<AddressManagerConfig>
): AddressManagerConfig {
	return {
		servicePort: 8080,
		addressManagerUrl: "https://discovery:3000",
		discoveryUrls: ["https://discovery:3000"],
		cacheTtlMs: 30000,
		servicePingTimeoutMs: 2000,
		discoveryTimeoutMs: 5000,
		tokenRefreshIntervalMs: 60000,
		ttlRefreshIntervalMs: 15000,
		identity: { serviceName: "test-service", instanceId: "instance-1" },
		tls: {
			caPath: "/path/to/ca.pem",
			certPath: "/path/to/cert.pem",
			keyPath: "/path/to/key.pem",
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

	it("should create instance with Redis cache", () => {
		const am = new AddressManager(
			makeConfig({ redisCacheUrl: "redis://localhost:6379" })
		);
		expect(am).toBeInstanceOf(AddressManager);
	});

	it("should create instance with WebSocket URL", () => {
		const am = new AddressManager(
			makeConfig({ wsUrl: "wss://localhost:3000/ws" })
		);
		expect(am).toBeInstanceOf(AddressManager);
	});

	it("should create instance with DNS name map", () => {
		const am = new AddressManager(
			makeConfig({ dnsNameMap: { "test-service": "custom-host" } })
		);
		expect(am).toBeInstanceOf(AddressManager);
	});

	it("should find a service", async () => {
		const am = new AddressManager(makeConfig());
		const instance = await am.findService("test-service");
		expect(instance).toBeDefined();
	});

	it("should start and stop", async () => {
		const am = new AddressManager(makeConfig());
		const handle = am.start();
		handle.stop();
	});

	it("should find all services", async () => {
		const am = new AddressManager(makeConfig());
		const instances = await am.findAllServices("test-service");
		expect(instances).toHaveLength(1);
		expect(instances[0].serviceName).toBe("test-service");
	});

	it("should record call success without durationMs", () => {
		const am = new AddressManager(makeConfig());
		am.recordCallSuccess("instance-1");
	});

	it("should record call success with durationMs", () => {
		const am = new AddressManager(makeConfig());
		am.recordCallSuccess("instance-1", 42);
	});

	it("should record call failure without durationMs", () => {
		const am = new AddressManager(makeConfig());
		am.recordCallFailure("instance-1");
	});

	it("should record call failure with durationMs", () => {
		const am = new AddressManager(makeConfig());
		am.recordCallFailure("instance-1", 100);
	});

	it("should get metrics", () => {
		const am = new AddressManager(makeConfig());
		const metrics = am.getMetrics();
		expect(metrics).toHaveProperty("memory");
		expect(metrics).toHaveProperty("cpu");
	});

	it("should get service call tracker", () => {
		const am = new AddressManager(makeConfig());
		const tracker = am.getServiceCallTracker();
		expect(tracker.snapshot().totalCalls).toBe(0);
	});

	it("should listen on express app", () => {
		const am = new AddressManager(makeConfig());
		const app = {
			use: jest.fn<any>(),
			get: jest.fn<any>(),
			locals: {} as Record<string, unknown>,
		};
		am.listenExpress(app as any);
		expect(app.use).toHaveBeenCalled();
		expect(app.get).toHaveBeenCalledWith("/prometheus", expect.any(Function));
	});

	it("should handle start already started", async () => {
		const am = new AddressManager(makeConfig());
		const handle1 = am.start();
		const handle2 = am.start();
		handle1.stop();
		handle2.stop();
	});

	it("should not crash on start with existing token (sticky registration)", async () => {
		MOCK_TOKEN_MANAGER.getTokenOrUndefined.mockReturnValue("existing-token");
		MOCK_ADDRESS_MANAGER_CLIENT.refreshTTL.mockResolvedValue(undefined);
		const am = new AddressManager(makeConfig());
		const handle = am.start();
		handle.stop();
	});

	it("should return token from getToken", () => {
		const am = new AddressManager(makeConfig());
		const token = am.getToken();
		expect(token).toBe("tok");
	});

	it("should retry findService when circuit breaker is open", async () => {
		MOCK_TOKEN_MANAGER.getTokenOrUndefined.mockReturnValue("existing-token");
		MOCK_ADDRESS_MANAGER_CLIENT.refreshTTL.mockResolvedValue(undefined);
		const am = new AddressManager(makeConfig());

		am.recordCallFailure("i-1");
		am.recordCallFailure("i-1");
		am.recordCallFailure("i-1");

		// Circuit breaker is open for i-1, findService will retry and eventually fail
		await expect(am.findService("test-service")).rejects.toThrow();
	});
});
