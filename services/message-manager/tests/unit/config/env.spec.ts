import { describe, expect, it, jest } from "@jest/globals";

describe("env", () => {
	it("should validate env with defaults", () => {
		jest.isolateModules(() => {
			process.env = {
				...process.env,
				APP_NAME: "test-app",
				NODE_ENV: "test",
				INSTANCE_ID: "test-instance",
				REDIS_URL: "redis://redis:6379",
			};

			const { ENV } = require("../../../src/infrastructure/config/env");
			expect(ENV.REDIS_URL).toBe("redis://redis:6379");
			expect(ENV.BROKER_INSTANCE_ID).toBe("message-manager-1");
		});
	});

	it("should use REDIS_URL when provided", () => {
		jest.isolateModules(() => {
			process.env = {
				...process.env,
				APP_NAME: "test-app",
				NODE_ENV: "test",
				INSTANCE_ID: "test-instance",
				REDIS_URL: "redis://redis:6379",
			};

			const { ENV } = require("../../../src/infrastructure/config/env");
			expect(ENV.REDIS_URL).toBe("redis://redis:6379");
		});
	});

	it("should use custom values when provided", () => {
		jest.isolateModules(() => {
			process.env = {
				...process.env,
				APP_NAME: "test-app",
				NODE_ENV: "test",
				INSTANCE_ID: "test-instance",
				REDIS_URL: "redis://custom:6380",
				REDIS_PASSWORD: "secret",
				REDIS_PREFIX: "custom:",
				BROKER_INSTANCE_ID: "broker-2",
			};

			const { ENV } = require("../../../src/infrastructure/config/env");
			expect(ENV.REDIS_URL).toBe("redis://custom:6380");
			expect(ENV.REDIS_PASSWORD).toBe("secret");
			expect(ENV.REDIS_PREFIX).toBe("custom:");
			expect(ENV.BROKER_INSTANCE_ID).toBe("broker-2");
		});
	});

	it("should enable TLS when flag is set", () => {
		jest.isolateModules(() => {
			process.env = {
				...process.env,
				APP_NAME: "test-app",
				NODE_ENV: "test",
				INSTANCE_ID: "test-instance",
				REDIS_TLS_ENABLED: "true",
			};

			const { ENV } = require("../../../src/infrastructure/config/env");
			expect(ENV.REDIS_TLS_ENABLED).toBe(true);
		});
	});

	it("should parse MONGO env vars", () => {
		jest.isolateModules(() => {
			process.env = {
				...process.env,
				APP_NAME: "test-app",
				NODE_ENV: "test",
				INSTANCE_ID: "test-instance",
				MONGO_ARCHIVE_URI: "mongodb://mongo:27017",
				MONGO_ARCHIVE_DB: "test_db",
				MONGO_ARCHIVE_INTERVAL_MS: "5000",
				MONGO_ARCHIVE_RETENTION_DAYS: "7",
			};

			const { ENV } = require("../../../src/infrastructure/config/env");
			expect(ENV.MONGO_ARCHIVE_URI).toBe("mongodb://mongo:27017");
			expect(ENV.MONGO_ARCHIVE_DB).toBe("test_db");
			expect(ENV.MONGO_ARCHIVE_INTERVAL_MS).toBe(5000);
			expect(ENV.MONGO_ARCHIVE_RETENTION_DAYS).toBe(7);
		});
	});
});
