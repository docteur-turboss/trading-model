import { AddressManagerEnvSchema } from "../src/infrastructure/validation/address-manager-env";
import {
	BaseEnvSchema,
	validateEnv,
} from "../src/infrastructure/validation/env";

describe("BaseEnvSchema", () => {
	it("uses defaults for optional fields", () => {
		const result = BaseEnvSchema.parse({
			TLS_KEY_PATH: "/key.pem",
			TLS_CERT_PATH: "/cert.pem",
			TLS_CA_PATH: "/ca.pem",
		});
		expect(result.PORT).toBe(3000);
		expect(result.LOG_LEVEL).toBe("info");
		expect(result.NODE_ENV).toBe("development");
	});

	it("parses valid input with all fields", () => {
		const result = BaseEnvSchema.parse({
			NODE_ENV: "production",
			PORT: "443",
			TLS_KEY_PATH: "/key.pem",
			TLS_CERT_PATH: "/cert.pem",
			TLS_CA_PATH: "/ca.pem",
			LOG_LEVEL: "error",
		});
		expect(result.NODE_ENV).toBe("production");
		expect(result.PORT).toBe(443);
		expect(result.LOG_LEVEL).toBe("error");
	});

	it("rejects invalid NODE_ENV", () => {
		expect(() =>
			BaseEnvSchema.parse({
				NODE_ENV: "invalid",
				TLS_KEY_PATH: "/key.pem",
				TLS_CERT_PATH: "/cert.pem",
				TLS_CA_PATH: "/ca.pem",
			})
		).toThrow();
	});

	it("rejects non-positive PORT", () => {
		expect(() =>
			BaseEnvSchema.parse({
				PORT: "0",
				TLS_KEY_PATH: "/key.pem",
				TLS_CERT_PATH: "/cert.pem",
				TLS_CA_PATH: "/ca.pem",
			})
		).toThrow();
	});

	it("rejects empty TLS paths", () => {
		expect(() =>
			BaseEnvSchema.parse({
				TLS_KEY_PATH: "",
				TLS_CERT_PATH: "/cert.pem",
				TLS_CA_PATH: "/ca.pem",
			})
		).toThrow();
	});
});

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
		expect(result.MESSAGE_BUS_INIT_TIMEOUT_MS).toBe(2000);
		expect(result.MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS).toBe(2000);
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

	it("parses ADDRESS_MANAGER_URLS", () => {
		const result = AddressManagerEnvSchema.parse({
			...baseEnv,
			ADDRESS_MANAGER_URLS: '["https://ds1:3000","https://ds2:3000"]',
		});
		expect(result.ADDRESS_MANAGER_URLS).toBe(
			'["https://ds1:3000","https://ds2:3000"]'
		);
	});

	it("rejects missing required fields", () => {
		expect(() => AddressManagerEnvSchema.parse({})).toThrow();
	});
});

describe("validateEnv", () => {
	it("returns parsed data on success", () => {
		process.env.TLS_KEY_PATH = "/key.pem";
		process.env.TLS_CERT_PATH = "/cert.pem";
		process.env.TLS_CA_PATH = "/ca.pem";
		const result = validateEnv(BaseEnvSchema);
		expect(result).toBeDefined();
		expect(result.TLS_KEY_PATH).toBe("/key.pem");
	});
});
