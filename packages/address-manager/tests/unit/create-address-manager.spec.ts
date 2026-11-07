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
});
