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

		const { ENV } = require("../../../src/infrastructure/config/env");
		expect(ENV.LOG_LEVEL).toBe("info");
		expect(ENV.PORT).toBe(3000);
	});

	it("should export correct values when all env vars provided", () => {
		setRequiredVars();

		const { ENV } = require("../../../src/infrastructure/config/env");
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

		expect(() => require("../../../src/infrastructure/config/env")).toThrow();

		consoleSpy.mockRestore();
	});

	it("should throw when APP_NAME is missing", () => {
		const consoleSpy = jest
			.spyOn(console, "error")
			.mockImplementation(() => {});

		setRequiredVars();
		delete process.env.APP_NAME;

		expect(() => require("../../../src/infrastructure/config/env")).toThrow();

		consoleSpy.mockRestore();
	});

	it("should set default values for scraper-specific env vars", () => {
		setRequiredVars();

		const { ENV } = require("../../../src/infrastructure/config/env");
		expect(ENV.BINANCE_API_KEY).toBe("");
		expect(ENV.BINANCE_API_SECRET).toBe("");
		expect(ENV.SYMBOLS_TO_TRACK).toEqual([]);
		expect(ENV.SCRAPE_INTERVAL).toBe("*/1 * * * *");
	});

	it("should parse SYMBOLS_TO_TRACK from JSON string", () => {
		setRequiredVars();
		process.env.SYMBOLS_TO_TRACK = '["BTCUSDT","ETHUSDT"]';

		const { ENV } = require("../../../src/infrastructure/config/env");
		expect(ENV.SYMBOLS_TO_TRACK).toEqual(["BTCUSDT", "ETHUSDT"]);
	});

	it("should parse SYMBOLS_TO_TRACK from a CSV list", () => {
		setRequiredVars();
		process.env.SYMBOLS_TO_TRACK = "BTCUSDT, ETHUSDT";

		const { ENV } = require("../../../src/infrastructure/config/env");
		expect(ENV.SYMBOLS_TO_TRACK).toEqual(["BTCUSDT", "ETHUSDT"]);
	});

	it("should return an empty array for an empty SYMBOLS_TO_TRACK", () => {
		setRequiredVars();
		process.env.SYMBOLS_TO_TRACK = "";

		const { ENV } = require("../../../src/infrastructure/config/env");
		expect(ENV.SYMBOLS_TO_TRACK).toEqual([]);
	});

	it.each([
		["invalid JSON", '["BTCUSDT"'],
		["a JSON object", '{"key":"value"}'],
		["a non-string element", '["BTCUSDT",42]'],
		["a lowercase symbol", "btcusdt"],
		["an empty CSV item", "BTCUSDT,,ETHUSDT"],
	])("should throw when SYMBOLS_TO_TRACK is %s", (_label, value) => {
		const consoleSpy = jest
			.spyOn(console, "error")
			.mockImplementation(() => {});
		setRequiredVars();
		process.env.SYMBOLS_TO_TRACK = value;

		expect(() => require("../../../src/infrastructure/config/env")).toThrow();

		consoleSpy.mockRestore();
	});

	it("should enable the scrape scheduler by default", () => {
		setRequiredVars();

		const { ENV } = require("../../../src/infrastructure/config/env");
		expect(ENV.SCRAPE_SCHEDULER_ENABLED).toBe(true);
	});

	it("should disable the scrape scheduler when SCRAPE_SCHEDULER_ENABLED=false", () => {
		setRequiredVars();
		process.env.SCRAPE_SCHEDULER_ENABLED = "false";

		const { ENV } = require("../../../src/infrastructure/config/env");
		expect(ENV.SCRAPE_SCHEDULER_ENABLED).toBe(false);
	});

	it("should default BINANCE_BASE_URL to the public Binance API", () => {
		setRequiredVars();

		const { ENV } = require("../../../src/infrastructure/config/env");
		expect(ENV.BINANCE_BASE_URL).toBe("https://api.binance.com");
	});

	it("should throw when BINANCE_BASE_URL is not a URL", () => {
		const consoleSpy = jest
			.spyOn(console, "error")
			.mockImplementation(() => {});
		setRequiredVars();
		process.env.BINANCE_BASE_URL = "not-a-url";

		expect(() => require("../../../src/infrastructure/config/env")).toThrow();

		consoleSpy.mockRestore();
	});

	it("should use provided scraper-specific env vars", () => {
		setRequiredVars();
		process.env.BINANCE_API_KEY = "test-api-key";
		process.env.BINANCE_API_SECRET = "test-api-secret";
		process.env.SCRAPE_INTERVAL = "*/5 * * * *";
		process.env.BINANCE_BASE_URL = "http://binance-stub:8080";

		const { ENV } = require("../../../src/infrastructure/config/env");
		expect(ENV.BINANCE_API_KEY).toBe("test-api-key");
		expect(ENV.BINANCE_API_SECRET).toBe("test-api-secret");
		expect(ENV.SCRAPE_INTERVAL).toBe("*/5 * * * *");
		expect(ENV.BINANCE_BASE_URL).toBe("http://binance-stub:8080");
	});
});
