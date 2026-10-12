import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

const OLD_ENV = process.env;

beforeEach(() => {
	jest.resetModules();
	process.env = { ...OLD_ENV };
});

afterEach(() => {
	process.env = OLD_ENV;
});

describe("env configuration", () => {
	it("should use defaults when env vars are not set", () => {
		process.env.NODE_ENV = "development";
		process.env.TLS_KEY_PATH = "/certs/key.pem";
		process.env.TLS_CERT_PATH = "/certs/cert.pem";
		process.env.TLS_CA_PATH = "/certs/ca.pem";
		process.env.ERROR_URL_WEBHOOK = "https://hooks.example.com/error";

		const { ENV } = require("../../src/infrastructure/config/env") as {
			ENV: Record<string, unknown>;
		};
		expect(ENV.PORT).toBe(3000);
		expect(ENV.NODE_ENV).toBe("development");
		expect(ENV.LOG_LEVEL).toBe("info");
		expect(ENV.CLEANUP_SERVICE_INTERVAL_MS).toBe(600_000);
	});

	it("should read PORT from env", () => {
		process.env.PORT = "8443";
		process.env.TLS_KEY_PATH = "/certs/key.pem";
		process.env.TLS_CERT_PATH = "/certs/cert.pem";
		process.env.TLS_CA_PATH = "/certs/ca.pem";
		process.env.ERROR_URL_WEBHOOK = "https://hooks.example.com/error";

		const { ENV } = require("../../src/infrastructure/config/env") as {
			ENV: Record<string, unknown>;
		};
		expect(ENV.PORT).toBe(8443);
	});

	it("should read CLEANUP_SERVICE_INTERVAL_MS from env", () => {
		process.env.CLEANUP_SERVICE_INTERVAL_MS = "10000";
		process.env.TLS_KEY_PATH = "/certs/key.pem";
		process.env.TLS_CERT_PATH = "/certs/cert.pem";
		process.env.TLS_CA_PATH = "/certs/ca.pem";
		process.env.ERROR_URL_WEBHOOK = "https://hooks.example.com/error";

		const { ENV } = require("../../src/infrastructure/config/env") as {
			ENV: Record<string, unknown>;
		};
		expect(ENV.CLEANUP_SERVICE_INTERVAL_MS).toBe(10000);
	});

	it("should require REGISTRATION_TOKEN in production", () => {
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

		process.env.NODE_ENV = "production";
		process.env.TLS_KEY_PATH = "/certs/key.pem";
		process.env.TLS_CERT_PATH = "/certs/cert.pem";
		process.env.TLS_CA_PATH = "/certs/ca.pem";
		process.env.ERROR_URL_WEBHOOK = "https://hooks.example.com/error";
		delete process.env.REGISTRATION_TOKEN;

		jest.isolateModules(() => {
			expect(() => require("../../src/infrastructure/config/env")).toThrow(
				"Environment validation failed"
			);
		});

		errorSpy.mockRestore();
	});

	it("should accept production env with REGISTRATION_TOKEN and CIDRs set", () => {
		process.env.NODE_ENV = "production";
		process.env.TLS_KEY_PATH = "/certs/key.pem";
		process.env.TLS_CERT_PATH = "/certs/cert.pem";
		process.env.TLS_CA_PATH = "/certs/ca.pem";
		process.env.ERROR_URL_WEBHOOK = "https://hooks.example.com/error";
		process.env.REGISTRATION_TOKEN = "prod-token";
		process.env.ALLOWED_REGISTRATION_CIDRS = "10.0.0.0/8";

		const { ENV } = require("../../src/infrastructure/config/env") as {
			ENV: Record<string, unknown>;
		};
		expect(ENV.NODE_ENV).toBe("production");
		expect(ENV.REGISTRATION_TOKEN).toBe("prod-token");
		expect(ENV.ALLOWED_REGISTRATION_CIDRS).toBe("10.0.0.0/8");
	});

	it("should throw ConfigurationError on invalid env", () => {
		const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

		process.env.TLS_KEY_PATH = "";
		process.env.TLS_CERT_PATH = "";
		process.env.TLS_CA_PATH = "";
		process.env.ERROR_URL_WEBHOOK = "not-a-url";

		jest.isolateModules(() => {
			expect(() => require("../../src/infrastructure/config/env")).toThrow(
				"Environment validation failed"
			);
		});

		errorSpy.mockRestore();
	});
});
