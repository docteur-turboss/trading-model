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
		process.env.AUTH_TOKENS = "a:read:tok1,b:read:tok2";

		const env = loadEnv();

		expect(env.AUTH_TOKENS).toBe("a:read:tok1,b:read:tok2");
	});

	describe("in production", () => {
		const STRONG_KEY = "ops:read:0123456789abcdef0123456789abcdef";

		beforeEach(() => {
			process.env.TLS_KEY_PATH = "/certs/key.pem";
			process.env.TLS_CERT_PATH = "/certs/cert.pem";
			process.env.TLS_CA_PATH = "/certs/ca.pem";
			process.env.NODE_ENV = "production";
			process.env.AUTH_TOKENS = STRONG_KEY;
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

		it("should still start with the retired dlq:write scope of an N-1 token (#1241)", () => {
			process.env.AUTH_TOKENS = `ops:read+dlq:write:${STRONG_KEY.split(":").pop()}`;
			expect(loadEnv().AUTH_TOKENS).toContain("dlq:write");
		});

		it("should refuse to start with a malformed API key, without logging its secret", () => {
			process.env.AUTH_TOKENS = "ops:admin:top-secret-value";
			const issues = refusal();
			expect(issues).toContain("scopes must be among read");
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

		it("should refuse a weak secret in staging", () => {
			process.env.NODE_ENV = "staging";
			process.env.AUTH_TOKENS = "ops:read:abc";
			expect(refusal()).toContain("secret");
		});

		it.each(["development", "test"])(
			"should accept a weak secret in %s",
			(nodeEnv) => {
				process.env.NODE_ENV = nodeEnv;
				process.env.AUTH_TOKENS = "ops:read:abc";
				expect(loadEnv().AUTH_TOKENS).toBe("ops:read:abc");
			}
		);
	});
});
