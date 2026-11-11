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
		expect(env.AUTH_STRICT).toBe(true);
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

	it("should accept custom AUTH_STRICT", () => {
		process.env.TLS_KEY_PATH = "/certs/key.pem";
		process.env.TLS_CERT_PATH = "/certs/cert.pem";
		process.env.TLS_CA_PATH = "/certs/ca.pem";
		process.env.AUTH_STRICT = "false";

		const env = loadEnv();

		expect(env.AUTH_STRICT).toBe(false);
	});

	describe("in production", () => {
		const STRONG_KEY = "ops:read:0123456789abcdef0123456789abcdef";

		beforeEach(() => {
			process.env.TLS_KEY_PATH = "/certs/key.pem";
			process.env.TLS_CERT_PATH = "/certs/cert.pem";
			process.env.TLS_CA_PATH = "/certs/ca.pem";
			process.env.NODE_ENV = "production";
			process.env.AUTH_TOKENS = STRONG_KEY;
			delete process.env.AUTH_STRICT;
		});

		/** The validation issues logged by a refused start. */
		function refusal(): string {
			const logged = jest.spyOn(console, "error").mockImplementation(() => {});
			expect(loadEnv).toThrow("Environment validation failed");
			const issues = JSON.stringify(logged.mock.calls);
			logged.mockRestore();
			return issues;
		}

		it("should accept configured API keys", () => {
			expect(loadEnv().AUTH_TOKENS).toBe(STRONG_KEY);
		});

		it.each(["", " , "])(
			"should refuse to start with AUTH_TOKENS=%j",
			(tokens) => {
				process.env.AUTH_TOKENS = tokens;
				expect(refusal()).toContain(
					"AUTH_TOKENS cannot be empty in production"
				);
			}
		);

		it("should refuse to start with a malformed API key, without logging its secret", () => {
			process.env.AUTH_TOKENS = "ops:admin:top-secret-value";
			const issues = refusal();
			expect(issues).toContain("scopes must be among read, dlq:write");
			expect(issues).not.toContain("top-secret-value");
		});

		it.each([
			"ops:read:abc",
			"ops:read:change-me-0123456789abcdef0123456789abcdef",
		])(
			"should refuse a weak API key secret without logging it: %#",
			(entry) => {
				process.env.AUTH_TOKENS = entry;
				const issues = refusal();
				expect(issues).toContain("secret");
				expect(issues).not.toContain(entry.slice(entry.lastIndexOf(":") + 1));
			}
		);

		it("should refuse to start with AUTH_STRICT=false", () => {
			process.env.AUTH_STRICT = "false";
			expect(refusal()).toContain("AUTH_STRICT cannot be false in production");
		});
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
