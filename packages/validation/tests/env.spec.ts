import { AddressManagerEnvSchema } from "../src/validation/address-manager-env";
import {
	BaseEnvSchema,
	MongoDbEnvSchema,
	MySQLEnvSchema,
	RedisEnvSchema,
	validateEnv,
} from "../src/validation/env";

describe("BaseEnvSchema", () => {
	it("uses defaults for optional fields", () => {
		const result = BaseEnvSchema.parse({
			TLS_KEY_PATH: "/key.pem",
			TLS_CERT_PATH: "/cert.pem",
			TLS_CA_PATH: "/ca.pem",
		});
		expect(result.PORT).toBe(3000);
		expect(result.LOG_LEVEL).toBe("info");
		expect(result.ERROR_URL_WEBHOOK).toBe("");
	});

	it("parses valid input with all fields", () => {
		const result = BaseEnvSchema.parse({
			NODE_ENV: "production",
			PORT: "443",
			TLS_KEY_PATH: "/key.pem",
			TLS_CERT_PATH: "/cert.pem",
			TLS_CA_PATH: "/ca.pem",
			LOG_LEVEL: "error",
			CERT_CLIENT_CA_URL: "https://ca.example.com",
			CERT_CLIENT_SERVICE_ID: "my-service",
			CERT_CLIENT_COMMON_NAME: "my-service.example.com",
			CERT_CLIENT_SANS: "alt1.example.com,alt2.example.com",
			CERT_CLIENT_BOOTSTRAP_TOKEN: "bootstrap-123",
		});
		expect(result.NODE_ENV).toBe("production");
		expect(result.PORT).toBe(443);
		expect(result.LOG_LEVEL).toBe("error");
		expect(result.CERT_CLIENT_CA_URL).toBe("https://ca.example.com");
		expect(result.CERT_CLIENT_SERVICE_ID).toBe("my-service");
		expect(result.CERT_CLIENT_COMMON_NAME).toBe("my-service.example.com");
		expect(result.CERT_CLIENT_SANS).toBe("alt1.example.com,alt2.example.com");
		expect(result.CERT_CLIENT_BOOTSTRAP_TOKEN).toBe("bootstrap-123");
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

describe("DISCOVERY_SERVICE_URL", () => {
	it("defaults to https://discovery-server:3000", () => {
		const result = BaseEnvSchema.parse({
			TLS_KEY_PATH: "/key.pem",
			TLS_CERT_PATH: "/cert.pem",
			TLS_CA_PATH: "/ca.pem",
		});
		expect(result.DISCOVERY_SERVICE_URL).toBe("https://discovery-server:3000");
	});

	it("accepts custom URL", () => {
		const result = BaseEnvSchema.parse({
			TLS_KEY_PATH: "/key.pem",
			TLS_CERT_PATH: "/cert.pem",
			TLS_CA_PATH: "/ca.pem",
			DISCOVERY_SERVICE_URL: "https://ds.custom:8443",
		});
		expect(result.DISCOVERY_SERVICE_URL).toBe("https://ds.custom:8443");
	});
});

describe("MongoDbEnvSchema", () => {
	it("uses defaults when no values provided", () => {
		const result = MongoDbEnvSchema.parse({});
		expect(result.MONGO_URI).toBe("mongodb://localhost:27017");
		expect(result.MONGO_DB).toBe("app");
		expect(result.MONGO_COLLECTION).toBe("records");
	});

	it("parses valid input", () => {
		const result = MongoDbEnvSchema.parse({
			MONGO_URI: "mongodb://mongo:27017/test",
			MONGO_DB: "test",
			MONGO_COLLECTION: "entries",
		});
		expect(result.MONGO_URI).toBe("mongodb://mongo:27017/test");
		expect(result.MONGO_DB).toBe("test");
		expect(result.MONGO_COLLECTION).toBe("entries");
	});
});

describe("MySQLEnvSchema", () => {
	it("uses defaults when no values provided", () => {
		const result = MySQLEnvSchema.parse({});
		expect(result.DB_HOST).toBe("localhost");
		expect(result.DB_PORT).toBe(3306);
		expect(result.DB_USER).toBe("root");
		expect(result.DB_PASSWORD).toBe("");
		expect(result.DB_NAME).toBe("trading_model");
	});

	it("parses valid input", () => {
		const result = MySQLEnvSchema.parse({
			DB_HOST: "10.0.0.5",
			DB_PORT: "5432",
			DB_USER: "admin",
			DB_PASSWORD: "secret",
			DB_NAME: "my_db",
		});
		expect(result.DB_HOST).toBe("10.0.0.5");
		expect(result.DB_PORT).toBe(5432);
		expect(result.DB_USER).toBe("admin");
		expect(result.DB_PASSWORD).toBe("secret");
		expect(result.DB_NAME).toBe("my_db");
	});
});

describe("RedisEnvSchema", () => {
	it("uses defaults when no values provided", () => {
		const result = RedisEnvSchema.parse({});
		expect(result.REDIS_TLS_ENABLED).toBe(false);
		expect(result.REDIS_PREFIX).toBe("mm:");
		expect(result.REDIS_MAX_RECONNECT_ATTEMPTS).toBe(10);
	});

	it("parses REDIS_TLS_ENABLED as boolean", () => {
		const enabled = RedisEnvSchema.parse({ REDIS_TLS_ENABLED: "true" });
		expect(enabled.REDIS_TLS_ENABLED).toBe(true);

		const disabled = RedisEnvSchema.parse({ REDIS_TLS_ENABLED: "false" });
		expect(disabled.REDIS_TLS_ENABLED).toBe(false);
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
