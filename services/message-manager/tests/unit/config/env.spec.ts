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
});
