import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import type { ServiceInstanceName } from "@trading-model/common/config/services.types";

jest.mock("@trading-model/http/http-client", () => ({
	HttpClient: {
		createWithTls: jest.fn<(...args: any[]) => any>().mockReturnValue({
			get: jest.fn<(...args: any[]) => any>(),
			post: jest.fn<(...args: any[]) => any>(),
		}),
	},
}));

jest.mock("@trading-model/http/logger", () => ({
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
jest.mock("../../src/client/address-manager-client", () => ({
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
	};
	return impl;
})();
jest.mock("../../src/client/token-manager", () => ({
	TokenManager: jest
		.fn<(...args: any[]) => any>()
		.mockReturnValue(MOCK_TOKEN_MANAGER),
}));

import {
	DurationMs,
	FilePath,
	InstanceId,
	IPAddress,
	Port,
	ServiceId,
} from "@trading-model/primitives/primitives";
import AddressManager from "../../src/address-manager";
import type { AddressManagerConfig } from "../../src/config/address-manager-config";

function makeConfig(
	overrides?: Partial<AddressManagerConfig>
): AddressManagerConfig {
	return {
		servicePort: Port.of(8080),
		addressManagerUrl: "https://discovery:3000",
		tokenRefreshIntervalMs: DurationMs.of(60000),
		ttlRefreshIntervalMs: DurationMs.of(15000),
		identity: {
			serviceName: ServiceId.of("test-service"),
			instanceId: InstanceId.of("instance-1"),
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
					[ServiceId.of("test-service")]: IPAddress.of("127.0.0.1"),
				},
			})
		);
		expect(am).toBeInstanceOf(AddressManager);
	});

	it("finds a service at its canonical DNS name on port 3000, no registry asked", async () => {
		const am = new AddressManager(makeConfig());
		await expect(
			am.findService("financial-scraper-service" as ServiceInstanceName)
		).resolves.toEqual({ host: "financial-scraper", port: 3000 });
	});

	it("finds a service through DNS_NAME_MAP when the name is mapped", async () => {
		const am = new AddressManager(
			makeConfig({
				dnsNameMap: {
					[ServiceId.of("test-service")]: IPAddress.of("127.0.0.1"),
				},
			})
		);
		await expect(
			am.findService("test-service" as ServiceInstanceName)
		).resolves.toEqual({ host: "127.0.0.1", port: 3000 });
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

	it("should leave the registry, then stop", async () => {
		const am = new AddressManager(makeConfig());
		const handle = am.lifecycleManager.start();
		await handle.ready;
		await handle.leave();
		expect(MOCK_ADDRESS_MANAGER_CLIENT.unregisterService).toHaveBeenCalledTimes(
			1
		);
		await handle.stop();
	});

	it("should resolve stop only after the unregistration completes", async () => {
		let release!: () => void;
		MOCK_ADDRESS_MANAGER_CLIENT.unregisterService.mockReturnValueOnce(
			new Promise<void>((resolve) => {
				release = resolve;
			})
		);
		const am = new AddressManager(makeConfig());
		const handle = am.lifecycleManager.start();
		await handle.ready;
		let stopped = false;
		const stopping = handle.stop().then(() => {
			stopped = true;
		});
		await Promise.resolve();
		expect(stopped).toBe(false);
		release();
		await stopping;
		expect(stopped).toBe(true);
	});

	it("should return token from getToken", () => {
		const am = new AddressManager(makeConfig());
		const token = am.tokenManager.getToken();
		expect(token).toBe("tok");
	});
});
