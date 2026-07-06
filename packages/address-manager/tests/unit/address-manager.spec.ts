import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/utils/sleep", () => ({
	sleep: jest.fn(() => Promise.resolve()),
}));

const MOCK_HTTP_CLIENT_INSTANCE = {
	post: jest.fn(),
	get: jest.fn(),
	delete: jest.fn(),
};

jest.mock("@trading-model/common/config/http-client", () => ({
	HttpClient: Object.assign(
		jest.fn().mockImplementation(() => MOCK_HTTP_CLIENT_INSTANCE),
		{ createWithTls: jest.fn(() => MOCK_HTTP_CLIENT_INSTANCE) }
	),
}));

const MOCK_TOKEN_MANAGER_INSTANCE = {
	getToken: jest.fn(() => "mock-token"),
	setToken: jest.fn(),
	refreshToken: jest.fn(),
};

jest.mock("../../src/client/token-manager", () => ({
	TokenManager: jest.fn().mockImplementation(() => MOCK_TOKEN_MANAGER_INSTANCE),
}));

const MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE = {
	registerService: jest.fn(),
	refreshTTL: jest.fn(),
};

jest.mock("../../src/client/address-manager-client", () => ({
	AddressManagerClient: jest
		.fn()
		.mockImplementation(() => MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE),
}));

const MOCK_SERVICE_CACHE_INSTANCE = {};

jest.mock("../../src/discovery/service-cache", () => ({
	ServiceCache: jest.fn().mockImplementation(() => MOCK_SERVICE_CACHE_INSTANCE),
}));

const MOCK_HEALTH_CHECKER_INSTANCE = {};

jest.mock("../../src/discovery/service-health-checker", () => ({
	ServiceHealthChecker: jest
		.fn()
		.mockImplementation(() => MOCK_HEALTH_CHECKER_INSTANCE),
}));

const MOCK_FIND_SERVICE = jest.fn();
jest.mock("../../src/discovery/service-discovery", () => ({
	ServiceDiscovery: jest.fn().mockImplementation(() => ({
		findService: MOCK_FIND_SERVICE,
	})),
}));

const MOCK_SCHEDULER_INSTANCE = {
	register: jest.fn(),
	start: jest.fn(),
	stop: jest.fn(),
};

jest.mock("../../src/scheduler/scheduler", () => ({
	Scheduler: jest.fn().mockImplementation(() => MOCK_SCHEDULER_INSTANCE),
}));

jest.mock("../../src/scheduler/refresh-job", () => ({
	RefreshJob: jest.fn((manager: unknown, callback: (m: unknown) => void) =>
		callback(manager)
	),
}));

const MOCK_PING_ROUTES = { get: jest.fn() };
jest.mock("../../src/http/routes/ping.routes", () => ({
	PING_ROUTES: MOCK_PING_ROUTES,
}));

import AddressManager from "../../src/index";

describe("AddressManager", () => {
	let am: AddressManager;

	const defaultConfig = {
		addressManagerUrl: "http://localhost:8443",
		servicePort: 8080,
		tokenRefreshIntervalMs: 300000,
		ttlRefreshIntervalMs: 300000,
		servicePingTimeoutMs: 2000,
		discoveryTimeoutMs: 5000,
		cacheTtlMs: 60000,
		discoveryUrls: ["http://localhost:8443"],
		identity: { serviceName: "test-service", instanceId: "instance-1" },
		tls: { caPath: "/path/to/ca.pem", certPath: "/path/to/cert.pem", keyPath: "/path/to/key.pem" },
	};

	beforeEach(() => {
		jest.clearAllMocks();
		am = new AddressManager(defaultConfig);
	});

	describe("constructor", () => {
		it("should create an instance", () => {
			expect(am).toBeInstanceOf(AddressManager);
		});

		it("should accept config with dnsNameMap", () => {
			const configWithDnsMap = {
				...defaultConfig,
				dnsNameMap: { "my-service": "my-host.local" },
			};
			const amWithDnsMap = new AddressManager(configWithDnsMap);
			expect(amWithDnsMap).toBeInstanceOf(AddressManager);
		});
	});

	describe("getToken", () => {
		it("should delegate to tokenManager.getToken", () => {
			const token = am.getToken();
			expect(token).toBe("mock-token");
			expect(MOCK_TOKEN_MANAGER_INSTANCE.getToken).toHaveBeenCalled();
		});
	});

	describe("findService", () => {
		it("should delegate to serviceDiscovery.findService", async () => {
			const expected = { ip: "192.168.1.1", port: 8080 };
			(MOCK_FIND_SERVICE as any).mockResolvedValue(expected);
			const result = await am.findService("some-service");
			expect(result).toBe(expected);
			expect(MOCK_FIND_SERVICE).toHaveBeenCalledWith("some-service");
		});
	});

	describe("listenExpress", () => {
		it("should call app.use with pingRoutes", () => {
			const app = { use: jest.fn() };
			am.listenExpress(app as any);
			expect(app.use).toHaveBeenCalledWith(MOCK_PING_ROUTES);
		});
	});

	describe("start", () => {
		it("should register service, create scheduler, and return stop handle", async () => {
			(
				MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService as any
			).mockResolvedValue({
				token: "new-token",
			});

			const handle = am.start();

			await new Promise(process.nextTick);

			expect(
				MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService
			).toHaveBeenCalled();
			expect(MOCK_TOKEN_MANAGER_INSTANCE.setToken).toHaveBeenCalledWith(
				"new-token"
			);
			expect(MOCK_SCHEDULER_INSTANCE.register).toHaveBeenCalledTimes(2);
			expect(MOCK_SCHEDULER_INSTANCE.start).toHaveBeenCalled();
			expect(handle).toHaveProperty("stop");

			handle.stop();
			expect(MOCK_SCHEDULER_INSTANCE.stop).toHaveBeenCalled();
		});

		it("should retry registration on failure and succeed on retry", async () => {
			(MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService as any)
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce({ token: "retry-token" });

			const handle = am.start();

			await new Promise(process.nextTick);

			expect(
				MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService
			).toHaveBeenCalledTimes(2);
			expect(MOCK_TOKEN_MANAGER_INSTANCE.setToken).toHaveBeenCalledWith(
				"retry-token"
			);

			handle.stop();
		});

		it("should log error after max retries exhausted", async () => {
			(
				MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService as any
			).mockRejectedValue(new Error("Service unreachable"));

			const handle = am.start();

			await new Promise(process.nextTick);

			expect(
				MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService
			).toHaveBeenCalledTimes(10);

			handle.stop();
		});

		it("should handle null registration response and retry", async () => {
			(
				MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService as any
			).mockResolvedValue(null);

			const handle = am.start();

			await new Promise(process.nextTick);

			expect(
				MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService
			).toHaveBeenCalledTimes(10);

			handle.stop();
		});

		it("should abort registration retry loop when stop is called", async () => {
			let resolveRegistration: (value: unknown) => void;
			(
				MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService as any
			).mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveRegistration = resolve;
					})
			);

			const handle = am.start();

			// First registration call is in-flight
			expect(
				MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService
			).toHaveBeenCalledTimes(1);

			handle.stop();
			resolveRegistration!(undefined);

			// Allow retry loop to check shouldRetryRegistration and exit
			await new Promise(process.nextTick);
			await new Promise(process.nextTick);

			// stop() was called, so no further retries
			expect(
				MOCK_ADDRESS_MANAGER_CLIENT_INSTANCE.registerService
			).toHaveBeenCalledTimes(1);
		});
	});
});
