import { describe, expect, it } from "@jest/globals";
import { AddressManagerEnvSchema } from "../../src/config/address-manager-env";

describe("AddressManagerEnvSchema", () => {
	const baseEnv = {
		TLS_KEY_PATH: "/key.pem",
		TLS_CERT_PATH: "/cert.pem",
		TLS_CA_PATH: "/ca.pem",
		APP_NAME: "test-app",
		SERVICE_NAME: "test-service",
		INSTANCE_ID: "instance-1",
		ADDRESS_MANAGER_URL: "https://am.example.com",
	};

	it("uses defaults for optional fields", () => {
		const result = AddressManagerEnvSchema.parse(baseEnv);
		expect(result.APP_VERSION).toBe("1.0.0");
		expect(result.CACHE_TTL_MS).toBe(30000);
		expect(result.SERVICE_PING_TIMEOUT_MS).toBe(2000);
		expect(result.DISCOVERY_TIMEOUT_MS).toBe(5000);
		expect(result.TOKEN_REFRESH_INTERVAL_MS).toBe(60000);
		expect(result.TTL_REFRESH_INTERVAL_MS).toBe(15000);
		expect(result.MESSAGE_CALLBACK_PATH).toBe("message");
		expect(result.DNS_NAME_MAP).toEqual({});
	});

	it("parses DNS_NAME_MAP JSON correctly", () => {
		const result = AddressManagerEnvSchema.parse({
			...baseEnv,
			DNS_NAME_MAP: '{"discovery-service":"ds.example.com"}',
		});
		expect(result.DNS_NAME_MAP).toEqual({
			"discovery-service": "ds.example.com",
		});
	});

	it("falls back to {} for invalid DNS_NAME_MAP JSON", () => {
		const result = AddressManagerEnvSchema.parse({
			...baseEnv,
			DNS_NAME_MAP: "not-json",
		});
		expect(result.DNS_NAME_MAP).toEqual({});
	});

	it("falls back to {} for non-object DNS_NAME_MAP", () => {
		const result = AddressManagerEnvSchema.parse({
			...baseEnv,
			DNS_NAME_MAP: '"string-value"',
		});
		expect(result.DNS_NAME_MAP).toEqual({});
	});

	it("rejects missing required fields", () => {
		expect(() => AddressManagerEnvSchema.parse({})).toThrow();
	});
});
