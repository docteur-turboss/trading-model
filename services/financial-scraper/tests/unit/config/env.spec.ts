import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const ORIGINAL_ENV = { ...process.env };

describe("env", () => {
	beforeEach(() => {
		jest.resetModules();
		process.env = { ...ORIGINAL_ENV };
	});

	const setRequiredVars = () => {
		process.env.NODE_ENV = "test";
		process.env.PORT = "3000";
		process.env.TLS_KEY_PATH = "/etc/tls/key.pem";
		process.env.TLS_CERT_PATH = "/etc/tls/cert.pem";
		process.env.TLS_CA_PATH = "/etc/tls/ca.pem";
		process.env.LOG_LEVEL = "debug";
		process.env.APP_NAME = "financial-scraper";
		process.env.APP_VERSION = "1.0.0";
		process.env.SERVICE_NAME = "financial-scraper-service";
		process.env.INSTANCE_ID = "instance-1";
		process.env.CACHE_TTL_MS = "30000";
		process.env.SERVICE_PING_TIMEOUT_MS = "2000";
		process.env.TOKEN_REFRESH_INTERVAL_MS = "60000";
		process.env.TTL_REFRESH_INTERVAL_MS = "15000";
		process.env.ADDRESS_MANAGER_URL = "https://address-manager.example.com";
		process.env.ERROR_URL_WEBHOOK = "https://webhook.example.com/error";
		process.env.MESSAGE_BUS_INIT_TIMEOUT_MS = "2000";
		process.env.MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS = "2000";
		process.env.MESSAGE_CALLBACK_PATH = "message";
	};

	it("should export env with default values when optional vars missing", () => {
		setRequiredVars();
		delete process.env.LOG_LEVEL;
		delete process.env.PORT;

		const { ENV } = require("../../../src/config/env");
		expect(ENV.LOG_LEVEL).toBe("info");
		expect(ENV.PORT).toBe(3000);
	});

	it("should export correct values when all env vars provided", () => {
		setRequiredVars();

		const { ENV } = require("../../../src/config/env");
		expect(ENV.NODE_ENV).toBe("test");
		expect(ENV.PORT).toBe(3000);
		expect(ENV.LOG_LEVEL).toBe("debug");
		expect(ENV.SERVICE_NAME).toBe("financial-scraper-service");
		expect(ENV.INSTANCE_ID).toBe("instance-1");
		expect(ENV.APP_NAME).toBe("financial-scraper");
	});

	it("should throw on validation failure when required vars missing", () => {
		const consoleSpy = jest
			.spyOn(console, "error")
			.mockImplementation(() => {});

		process.env = {};

		expect(() => require("../../../src/config/env")).toThrow();

		consoleSpy.mockRestore();
	});

	it("should throw when APP_NAME is missing", () => {
		const consoleSpy = jest
			.spyOn(console, "error")
			.mockImplementation(() => {});

		setRequiredVars();
		delete process.env.APP_NAME;

		expect(() => require("../../../src/config/env")).toThrow();

		consoleSpy.mockRestore();
	});

	it("should set default values for scraper-specific env vars", () => {
		setRequiredVars();

		const { ENV } = require("../../../src/config/env");
		expect(ENV.BINANCE_API_KEY).toBe("");
		expect(ENV.BINANCE_API_SECRET).toBe("");
		expect(ENV.SYMBOLS_TO_TRACK).toEqual([]);
		expect(ENV.SCRAPE_INTERVAL).toBe("*/1 * * * *");
		expect(ENV.DB_USER).toBe("root");
		expect(ENV.DB_PASSWORD).toBe("");
		expect(ENV.DB_NAME).toBe("financial_scraper");
		expect(ENV.DB_HOST).toBe("localhost");
		expect(ENV.DB_PORT).toBe(3306);
	});

	it("should parse SYMBOLS_TO_TRACK from JSON string", () => {
		setRequiredVars();
		process.env.SYMBOLS_TO_TRACK = '["BTCUSDT","ETHUSDT"]';

		const { ENV } = require("../../../src/config/env");
		expect(ENV.SYMBOLS_TO_TRACK).toEqual(["BTCUSDT", "ETHUSDT"]);
	});

	it("should return empty array for invalid SYMBOLS_TO_TRACK JSON", () => {
		setRequiredVars();
		process.env.SYMBOLS_TO_TRACK = "not-json";

		const { ENV } = require("../../../src/config/env");
		expect(ENV.SYMBOLS_TO_TRACK).toEqual([]);
	});

	it("should return empty array when SYMBOLS_TO_TRACK is valid JSON but not an array", () => {
		setRequiredVars();
		process.env.SYMBOLS_TO_TRACK = '{"key":"value"}';

		const { ENV } = require("../../../src/config/env");
		expect(ENV.SYMBOLS_TO_TRACK).toEqual([]);
	});

	it("should use provided scraper-specific env vars", () => {
		setRequiredVars();
		process.env.BINANCE_API_KEY = "test-api-key";
		process.env.BINANCE_API_SECRET = "test-api-secret";
		process.env.SCRAPE_INTERVAL = "*/5 * * * *";
		process.env.DB_USER = "custom_user";
		process.env.DB_PASSWORD = "custom_pass";
		process.env.DB_NAME = "custom_db";
		process.env.DB_HOST = "db.example.com";
		process.env.DB_PORT = "3307";

		const { ENV } = require("../../../src/config/env");
		expect(ENV.BINANCE_API_KEY).toBe("test-api-key");
		expect(ENV.BINANCE_API_SECRET).toBe("test-api-secret");
		expect(ENV.SCRAPE_INTERVAL).toBe("*/5 * * * *");
		expect(ENV.DB_USER).toBe("custom_user");
		expect(ENV.DB_PASSWORD).toBe("custom_pass");
		expect(ENV.DB_NAME).toBe("custom_db");
		expect(ENV.DB_HOST).toBe("db.example.com");
		expect(ENV.DB_PORT).toBe(3307);
	});
});
