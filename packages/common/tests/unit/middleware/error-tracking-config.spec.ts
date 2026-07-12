import { describe, expect, it } from "@jest/globals";
import {
	DurationMs,
	PositiveInt,
	URLString,
} from "../../../src/domain/primitives";
import {
	buildConfig,
	DEFAULT_CONFIG,
} from "../../../src/middleware/error-tracking-config";

describe("buildConfig", () => {
	it("should return defaults when no options provided", () => {
		const config = buildConfig({});
		expect(config.flushIntervalMs).toBe(5000);
		expect(config.batchSize).toBe(50);
		expect(config.serviceName).toBe("unknown");
		expect(config.serviceVersion).toBe("0.0.0");
		expect(config.instanceId).toBe("unknown");
	});

	it("should apply provided options", () => {
		const config = buildConfig({
			endpoint: URLString.of("https://example.com"),
			serviceName: "my-service" as never,
			serviceVersion: "1.0.0" as never,
			instanceId: "i-123" as never,
			flushIntervalMs: DurationMs.of(10000),
			batchSize: PositiveInt.of(100),
		});
		expect(config.flushIntervalMs).toBe(10000);
		expect(config.batchSize).toBe(100);
		expect(config.serviceName).toBe("my-service");
		expect(config.serviceVersion).toBe("1.0.0");
		expect(config.instanceId).toBe("i-123");
	});

	it("should provide default config", () => {
		expect(DEFAULT_CONFIG.flushIntervalMs).toBe(5000);
		expect(DEFAULT_CONFIG.batchSize).toBe(50);
	});
});
