import { describe, expect, it, jest } from "@jest/globals";

describe("env", () => {
	it("should validate env with defaults", () => {
		jest.isolateModules(() => {
			process.env = {
				...process.env,
				APP_NAME: "test-app",
				NODE_ENV: "test",
				INSTANCE_ID: "test-instance",
			};

			const { ENV } = require("../../../src/infrastructure/config/env");
			expect(ENV.APP_NAME).toBe("test-app");
			expect(ENV.NODE_ENV).toBe("test");
			expect(ENV.INSTANCE_ID).toBe("test-instance");
		});
	});

	it("should use custom OTEL endpoint when provided", () => {
		jest.isolateModules(() => {
			process.env = {
				...process.env,
				APP_NAME: "test-app",
				NODE_ENV: "test",
				INSTANCE_ID: "test-instance",
				OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel:4318",
			};

			const { ENV } = require("../../../src/infrastructure/config/env");
			expect(ENV.OTEL_EXPORTER_OTLP_ENDPOINT).toBe("http://otel:4318");
		});
	});

	it("should start in production without DLQ_AUTH_HMAC_SECRET", () => {
		jest.isolateModules(() => {
			const { DLQ_AUTH_HMAC_SECRET: _unused, ...rest } = process.env;
			process.env = {
				...rest,
				APP_NAME: "test-app",
				NODE_ENV: "production",
				INSTANCE_ID: "test-instance",
				REDIS_URL: "redis://localhost:6379",
			};
			expect(() =>
				require("../../../src/infrastructure/config/env")
			).not.toThrow();
		});
	});
});
