import { describe, expect, it, jest } from "@jest/globals";

const MOCK_ADDRESS_MANAGER_INSTANCE = {
	getToken: jest.fn(),
	start: jest.fn(() => ({ stop: jest.fn() })),
	findService: jest.fn(),
	listenExpress: jest.fn(),
};

jest.mock("../../src/index", () => ({
	__esModule: true,
	default: jest.fn().mockImplementation(() => MOCK_ADDRESS_MANAGER_INSTANCE),
}));

import { createAddressManager } from "../../src/create-address-manager";

describe("createAddressManager", () => {
	const MINIMAL_ENV = {
		addressManagerUrl: "http://localhost:8443",
		cacheTtlMs: 60000,
		discoveryTimeoutMs: 5000,
		instanceId: "instance-1",
		serviceName: "test-service",
		servicePingTimeoutMs: 2000,
		port: 8080,
		tokenRefreshIntervalMs: 300000,
		ttlRefreshIntervalMs: 300000,
		tlsCertPath: "/path/to/cert.pem",
		tlsKeyPath: "/path/to/key.pem",
		tlsCaPath: "/path/to/ca.pem",
	};

	it("should create an AddressManager with the given env", () => {
		const am = createAddressManager(MINIMAL_ENV);
		expect(am).toBe(MOCK_ADDRESS_MANAGER_INSTANCE);
	});

	it("should parse DNS_NAME_MAP when provided", () => {
		const am = createAddressManager({
			...MINIMAL_ENV,
			dnsNameMap: { "discovery-service": "discovery-server" },
		});
		expect(am).toBe(MOCK_ADDRESS_MANAGER_INSTANCE);
	});

	it("should parse ADDRESS_MANAGER_URLS when provided as valid JSON", () => {
		createAddressManager({
			...MINIMAL_ENV,
			addressManagerUrl: "http://fallback:8443",
			addressManagerUrls: '["http://ds1:3000","http://ds2:3000"]',
		});
	});

	it("should fall back to single URL when ADDRESS_MANAGER_URLS has invalid JSON", () => {
		createAddressManager({
			...MINIMAL_ENV,
			addressManagerUrl: "http://fallback:8443",
			addressManagerUrls: "not-json",
		});
	});

	it("should parse WS_SUBSCRIBED_SERVICES when provided as valid JSON", () => {
		createAddressManager({
			...MINIMAL_ENV,
			wsSubscribedServices: '["service-a","service-b"]',
		});
	});

	it("should handle invalid WS_SUBSCRIBED_SERVICES JSON gracefully", () => {
		createAddressManager({
			...MINIMAL_ENV,
			wsSubscribedServices: "not-json",
		});
	});

	it("should handle empty WS_SUBSCRIBED_SERVICES array", () => {
		createAddressManager({
			...MINIMAL_ENV,
			wsSubscribedServices: "[]",
		});
	});

	it("should handle WS_SUBSCRIBED_SERVICES with non-array JSON", () => {
		createAddressManager({
			...MINIMAL_ENV,
			wsSubscribedServices: '{"key": "value"}',
		});
	});

	it("should fall back to single URL when ADDRESS_MANAGER_URLS is empty array", () => {
		createAddressManager({
			...MINIMAL_ENV,
			addressManagerUrl: "http://fallback:8443",
			addressManagerUrls: "[]",
		});
	});

	it("should fall back to single URL when ADDRESS_MANAGER_URLS is non-array JSON", () => {
		createAddressManager({
			...MINIMAL_ENV,
			addressManagerUrl: "http://fallback:8443",
			addressManagerUrls: '{"key": "value"}',
		});
	});
});
