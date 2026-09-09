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

	it("should parse ADDRESS_MANAGER_URLS when provided as valid JSON", () => {
		createAddressManager({
			...MINIMAL_ENV,
			ADDRESS_MANAGER_URL: "http://fallback:8443",
			ADDRESS_MANAGER_URLS: '["http://ds1:3000","http://ds2:3000"]',
		});
	});

	it("should fall back to single URL when ADDRESS_MANAGER_URLS has invalid JSON", () => {
		createAddressManager({
			...MINIMAL_ENV,
			ADDRESS_MANAGER_URL: "http://fallback:8443",
			ADDRESS_MANAGER_URLS: "not-json",
		});
	});

	it("should parse WS_SUBSCRIBED_SERVICES when provided as valid JSON", () => {
		createAddressManager({
			...MINIMAL_ENV,
			WS_SUBSCRIBED_SERVICES: '["service-a","service-b"]',
		});
	});

	it("should handle invalid WS_SUBSCRIBED_SERVICES JSON gracefully", () => {
		createAddressManager({
			...MINIMAL_ENV,
			WS_SUBSCRIBED_SERVICES: "not-json",
		});
	});

	it("should handle empty WS_SUBSCRIBED_SERVICES array", () => {
		createAddressManager({
			...MINIMAL_ENV,
			WS_SUBSCRIBED_SERVICES: "[]",
		});
	});

	it("should handle WS_SUBSCRIBED_SERVICES with non-array JSON", () => {
		createAddressManager({
			...MINIMAL_ENV,
			WS_SUBSCRIBED_SERVICES: '{"key": "value"}',
		});
	});

	it("should fall back to single URL when ADDRESS_MANAGER_URLS is empty array", () => {
		createAddressManager({
			...MINIMAL_ENV,
			ADDRESS_MANAGER_URL: "http://fallback:8443",
			ADDRESS_MANAGER_URLS: "[]",
		});
	});

	it("should fall back to single URL when ADDRESS_MANAGER_URLS is non-array JSON", () => {
		createAddressManager({
			...MINIMAL_ENV,
			ADDRESS_MANAGER_URL: "http://fallback:8443",
			ADDRESS_MANAGER_URLS: '{"key": "value"}',
		});
	});
});
