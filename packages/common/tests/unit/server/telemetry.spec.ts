import { describe, expect, it, jest } from "@jest/globals";

const mockSdkShutdown = jest.fn<() => Promise<void>>();
mockSdkShutdown.mockResolvedValue(undefined);

jest.mock("../../../src/config/logger", () => {
	const mockFn = jest.fn();
	return {
		logger: {
			info: mockFn,
			warn: mockFn,
			error: mockFn,
			debug: mockFn,
		},
	};
});

jest.mock("@opentelemetry/api", () => ({
	DiagLogLevel: { WARN: 3 },
	DiagConsoleLogger: jest.fn(),
	diag: {
		setLogger: jest.fn(),
	},
}));

jest.mock("@opentelemetry/resources", () => ({
	resourceFromAttributes: jest.fn(() => ({})),
}));

jest.mock("@opentelemetry/sdk-node", () => {
	const shutdown = jest.fn<() => Promise<void>>();
	shutdown.mockResolvedValue(undefined);
	return {
		NodeSDK: jest.fn().mockImplementation(() => ({
			start: jest.fn(),
			shutdown,
		})),
	};
});

jest.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
	OTLPTraceExporter: jest.fn(),
}));

jest.mock("@opentelemetry/instrumentation-http", () => ({
	HttpInstrumentation: jest.fn(),
}));

jest.mock("@opentelemetry/instrumentation-express", () => ({
	ExpressInstrumentation: jest.fn(),
}));

import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/server/telemetry";
import { logger } from "../../../src/config/logger";

const testConfig = {
	serviceName: "test-service" as never,
	serviceVersion: "1.0.0",
	instanceId: "test-instance" as never,
};

describe("telemetry", () => {
	it("should log disabled when no otlpEndpoint", () => {
		initializeTelemetry(testConfig);
		expect(logger.info).toHaveBeenCalledWith(
			"OpenTelemetry disabled (no endpoint configured)",
			expect.any(Object)
		);
	});

	it("should initialize SDK when otlpEndpoint is provided", () => {
		initializeTelemetry({
			...testConfig,
			otlpEndpoint: "http://localhost:4318",
		});
		expect(logger.info).toHaveBeenCalledWith(
			"OpenTelemetry initialized",
			expect.any(Object)
		);
	});

	it("should shutdown telemetry", async () => {
		initializeTelemetry({
			...testConfig,
			otlpEndpoint: "http://localhost:4318",
		});
		await shutdownTelemetry();
		expect(logger.info).toHaveBeenCalledWith("OpenTelemetry shut down");
	});

	it("should handle shutdown when not initialized", async () => {
		await shutdownTelemetry();
	});

	it("should handle shutdown error gracefully", async () => {
		const { NodeSDK } = await import("@opentelemetry/sdk-node");
		const mockSdk = NodeSDK as jest.Mock;
		const instance = mockSdk.mock.results[0]?.value as {
			shutdown: jest.Mock<() => Promise<void>>;
		};
		if (instance) {
			instance.shutdown.mockRejectedValue(new Error("shutdown error"));
		}

		initializeTelemetry({
			...testConfig,
			otlpEndpoint: "http://localhost:4318",
		});
		await shutdownTelemetry();
		expect(logger.warn).toHaveBeenCalledWith(
			"OpenTelemetry shutdown error",
			expect.any(Object)
		);
	});
});
