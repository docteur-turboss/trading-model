import { describe, expect, it, jest } from "@jest/globals";

const MOCK_ADDRESS_MANAGER_INSTANCE = {
	getToken: jest.fn(),
	start: jest.fn(() => ({ stop: jest.fn() })),
	findService: jest.fn(),
	listenExpress: jest.fn(),
};

jest.mock("../../src/application/address-manager", () => ({
	__esModule: true,
	default: jest.fn().mockImplementation(() => MOCK_ADDRESS_MANAGER_INSTANCE),
}));

import AddressManager from "../../src/application/address-manager";
import { createAddressManager } from "../../src/application/create-address-manager";

describe("createAddressManager", () => {
	const MINIMAL_ENV: import("../../src/application/create-address-manager").AddressManagerEnv =
		{
			ADDRESS_MANAGER_URL: "http://localhost:8443",
			CACHE_TTL_MS: 60000,
			DISCOVERY_TIMEOUT_MS: 5000,
			INSTANCE_ID: "instance-1",
			SERVICE_NAME: "test-service",
			SERVICE_PING_TIMEOUT_MS: 2000,
			PORT: 8080,
			TOKEN_REFRESH_INTERVAL_MS: 300000,
			TTL_REFRESH_INTERVAL_MS: 300000,
			TLS_CERT_PATH: "/path/to/cert.pem",
			TLS_KEY_PATH: "/path/to/key.pem",
			TLS_CA_PATH: "/path/to/ca.pem",
		};

	it("should create an AddressManager with the given env", () => {
		const am = createAddressManager(MINIMAL_ENV);
		expect(am).toBe(MOCK_ADDRESS_MANAGER_INSTANCE);
	});

	it("should parse DNS_NAME_MAP when provided", () => {
		const am = createAddressManager({
			...MINIMAL_ENV,
			DNS_NAME_MAP: { "discovery-service": "discovery-server" },
		});
		expect(am).toBe(MOCK_ADDRESS_MANAGER_INSTANCE);
	});

	describe("shared Redis cache", () => {
		const configOf = () =>
			(AddressManager as unknown as jest.Mock).mock.calls.at(-1)?.[0] as {
				redisCache?: unknown;
			};

		it("keeps an in-memory cache when the service has no Redis", () => {
			createAddressManager(MINIMAL_ENV);
			expect(configOf().redisCache).toBeUndefined();
		});

		it("goes through the sentinels when REDIS_SENTINELS is set", () => {
			createAddressManager({
				...MINIMAL_ENV,
				REDIS_SENTINELS: "redis-sentinel-0:26379,redis-sentinel-1:26379",
				REDIS_SENTINEL_MASTER_NAME: "mymaster",
			});
			expect(configOf().redisCache).toEqual(
				expect.objectContaining({
					mode: "sentinel",
					config: expect.objectContaining({ name: "mymaster" }),
				})
			);
		});

		it("uses REDIS_URL without sentinels", () => {
			createAddressManager({ ...MINIMAL_ENV, REDIS_URL: "redis://redis:6379" });
			expect(configOf().redisCache).toEqual({
				mode: "single",
				url: "redis://redis:6379",
			});
		});
	});
});
