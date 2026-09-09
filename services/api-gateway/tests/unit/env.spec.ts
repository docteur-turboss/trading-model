import {
	afterAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

describe("env", () => {
	const OldEnv = process.env;

	beforeEach(() => {
		jest.resetModules();
		process.env = { ...OldEnv };
	});

	afterAll(() => {
		process.env = OldEnv;
	});

	function loadEnv(): Record<string, unknown> {
		const mod = require("../../src/infrastructure/config/env") as {
			ENV: Record<string, unknown>;
		};
		return mod.ENV;
	}

	it("should apply defaults when no env vars are set", () => {
		delete process.env.TLS_KEY_PATH;
		delete process.env.TLS_CERT_PATH;
		delete process.env.TLS_CA_PATH;
		delete process.env.NODE_ENV;

		process.env.TLS_KEY_PATH = "/certs/key.pem";
		process.env.TLS_CERT_PATH = "/certs/cert.pem";
		process.env.TLS_CA_PATH = "/certs/ca.pem";

		const env = loadEnv();

		expect(env.PORT).toBe(3000);
		expect(env.NODE_ENV).toBe("development");
		expect(env.LOG_LEVEL).toBe("info");
		expect(env.RATE_LIMIT_WINDOW_MS).toBe(60000);
		expect(env.RATE_LIMIT_MAX).toBe(100);
		expect(env.CACHE_TTL_MS).toBe(30000);
		expect(env.AUTH_TOKEN_HEADER).toBe("x-api-key");
		expect(env.AUTH_TOKENS).toBe("");
		expect(env.PROXY_TIMEOUT_MS).toBe(10000);
		expect(env.DISCOVERY_SERVICE_URL).toBe("https://discovery-server:3000");
	});

	it("should coerce string env vars to numbers", () => {
		process.env.TLS_KEY_PATH = "/certs/key.pem";
		process.env.TLS_CERT_PATH = "/certs/cert.pem";
		process.env.TLS_CA_PATH = "/certs/ca.pem";
		process.env.PORT = "8448";
		process.env.RATE_LIMIT_WINDOW_MS = "30000";
		process.env.CACHE_TTL_MS = "5000";
		process.env.PROXY_TIMEOUT_MS = "5000";

		const env = loadEnv();

		expect(env.PORT).toBe(8448);
		expect(env.RATE_LIMIT_WINDOW_MS).toBe(30000);
		expect(env.CACHE_TTL_MS).toBe(5000);
		expect(env.PROXY_TIMEOUT_MS).toBe(5000);
	});

	it("should accept custom AUTH_TOKENS", () => {
		process.env.TLS_KEY_PATH = "/certs/key.pem";
		process.env.TLS_CERT_PATH = "/certs/cert.pem";
		process.env.TLS_CA_PATH = "/certs/ca.pem";
		process.env.AUTH_TOKENS = "tok1,tok2,tok3";

		const env = loadEnv();

		expect(env.AUTH_TOKENS).toBe("tok1,tok2,tok3");
	});

	it("should accept custom DISCOVERY_SERVICE_URL", () => {
		process.env.TLS_KEY_PATH = "/certs/key.pem";
		process.env.TLS_CERT_PATH = "/certs/cert.pem";
		process.env.TLS_CA_PATH = "/certs/ca.pem";
		process.env.DISCOVERY_SERVICE_URL = "https://custom-discovery:8443";

		const env = loadEnv();

		expect(env.DISCOVERY_SERVICE_URL).toBe("https://custom-discovery:8443");
	});
});
