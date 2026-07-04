import { describe, expect, it, jest } from "@jest/globals";

function setBaseEnv(): void {
	process.env.APP_NAME = "dlq-service:test";
	process.env.APP_VERSION = "1.0.0";
	process.env.PORT = "3000";
	process.env.SERVICE_NAME = "dlq-service";
	process.env.INSTANCE_ID = "test-dlq-1";
	process.env.TLS_KEY_PATH = "/tmp/key.pem";
	process.env.TLS_CERT_PATH = "/tmp/cert.pem";
	process.env.TLS_CA_PATH = "/tmp/ca.pem";
	process.env.CERT_CLIENT_CA_URL = "https://ca:3000";
	process.env.CERT_CLIENT_SERVICE_ID = "dlq-service";
	process.env.CERT_CLIENT_SANS = "localhost";
	process.env.CERT_CLIENT_BOOTSTRAP_TOKEN = "token123";
	process.env.CA_CLIENT_TLS_KEY = "/tmp/ca-key.pem";
	process.env.CA_CLIENT_TLS_CERT = "/tmp/ca-cert.pem";
	process.env.CA_CLIENT_TLS_CA = "/tmp/ca.pem";
	process.env.ADDRESS_MANAGER_URL = "https://localhost:8443";
	process.env.CACHE_TTL_MS = "84000000";
	process.env.SERVICE_PING_TIMEOUT_MS = "84000000";
	process.env.TOKEN_REFRESH_INTERVAL_MS = "84000000";
	process.env.TTL_REFRESH_INTERVAL_MS = "84000000";
	process.env.MESSAGE_BUS_INIT_TIMEOUT_MS = "5000";
	process.env.MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS = "5000";
	process.env.MESSAGE_CALLBACK_PATH = "message";
	process.env.MONGO_URI = "mongodb://localhost:27017/test";
	process.env.MONGO_DB = "test";
	process.env.MONGO_COLLECTION = "test";
	process.env.MAX_ENTRIES = "100";
	process.env.DLQ_RETRY_MAX_ATTEMPTS = "3";
	process.env.DLQ_AUTH_HMAC_SECRET = "test-secret-16-chars";
	process.env.DLQ_ALLOWED_SERVICES = "message-manager,admin";
	process.env.DLQ_PRUNE_INTERVAL_MS = "60000";
	process.env.DLQ_AUTO_RETRY_ENABLED = "false";
	process.env.DLQ_AUTO_RETRY_INTERVAL_MS = "30000";
	process.env.DLQ_AUTO_RETRY_LIMIT = "50";
}

describe("env", () => {
	describe("resolveAuthHmacSecret", () => {
		beforeEach(() => {
			jest.resetModules();
			setBaseEnv();
		});

		afterEach(() => {
			jest.resetModules();
		});

		it("should return the env var value when set", () => {
			const { resolveAuthHmacSecret } = require("../../src/config/env");
			const secret = resolveAuthHmacSecret();
			expect(secret).toBe("test-secret-16-chars");
		});

		it("should throw when no secret is available", () => {
			delete process.env.DLQ_AUTH_HMAC_SECRET;
			const { resolveAuthHmacSecret } = require("../../src/config/env");
			expect(() => resolveAuthHmacSecret()).toThrow(
				"DLQ_AUTH_HMAC_SECRET is required"
			);
		});

		it("should cache the secret value", () => {
			const { resolveAuthHmacSecret } = require("../../src/config/env");
			const first = resolveAuthHmacSecret();
			delete process.env.DLQ_AUTH_HMAC_SECRET;
			const second = resolveAuthHmacSecret();
			expect(first).toBe(second);
		});

		it("should read from file path when env var is missing", () => {
			delete process.env.DLQ_AUTH_HMAC_SECRET;

			const filePath = "C:\\Users\\doc\\AppData\\Local\\Temp\\hmac-test.txt";
			require("node:fs").writeFileSync(filePath, "file-based-secret-16!!");
			process.env.DLQ_AUTH_HMAC_SECRET_PATH = filePath;

			jest.resetModules();
			setBaseEnv();
			delete process.env.DLQ_AUTH_HMAC_SECRET;
			process.env.DLQ_AUTH_HMAC_SECRET_PATH = filePath;

			const { resolveAuthHmacSecret } = require("../../src/config/env");
			const secret = resolveAuthHmacSecret();
			expect(secret).toBe("file-based-secret-16!!");
			require("node:fs").unlinkSync(filePath);
		});
	});
});
