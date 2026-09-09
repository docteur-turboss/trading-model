import { describe, it, jest } from "@jest/globals";

const mockShutdown = jest
	.fn<() => Promise<void>>()
	.mockRejectedValue(new Error("shutdown error"));
const mockStart = jest.fn();

jest.mock("@opentelemetry/api", () => ({
	DiagConsoleLogger: jest.fn(),
	DiagLogLevel: { WARN: 0 },
	diag: { setLogger: jest.fn() },
}));

jest.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
	OTLPTraceExporter: jest.fn(),
}));

jest.mock("@opentelemetry/instrumentation-express", () => ({
	ExpressInstrumentation: jest.fn(),
}));

jest.mock("@opentelemetry/instrumentation-http", () => ({
	HttpInstrumentation: jest.fn(),
}));

jest.mock("@opentelemetry/instrumentation-ioredis", () => ({
	IORedisInstrumentation: jest.fn(),
}));

jest.mock("@opentelemetry/resources", () => ({
	resourceFromAttributes: jest.fn(() => ({})),
}));

jest.mock("@opentelemetry/sdk-node", () => ({
	NodeSDK: jest.fn().mockImplementation(() => ({
		start: mockStart,
		shutdown: mockShutdown,
	})),
}));

jest.mock("../../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../../src/infrastructure/config/env", () => ({
	ENV: {
		OTEL_EXPORTER_OTLP_ENDPOINT: "http://otel:4318",
		APP_NAME: "test-app",
		APP_VERSION: "1.0.0",
		INSTANCE_ID: "test-instance",
	},
}));

import {
	initializeTelemetry,
	shutdownTelemetry,
} from "../../../src/config/telemetry";

describe("telemetry shutdown error", () => {
	it("should handle shutdown error gracefully", async () => {
		initializeTelemetry();
		await shutdownTelemetry();
	});
});
