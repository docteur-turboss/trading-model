const mockNodeSDK = jest.fn().mockImplementation(() => ({
	start: jest.fn(),
	shutdown: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@opentelemetry/sdk-node", () => ({
	NodeSDK: mockNodeSDK,
}));

const mockOtlpExporter = jest.fn();
jest.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
	OTLPTraceExporter: mockOtlpExporter,
}));

import {
	shutdownTelemetry,
	startTelemetry,
} from "../src/infrastructure/telemetry";

describe("telemetry", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("startTelemetry", () => {
		const SAVED_ENV = { ...process.env };

		afterEach(() => {
			process.env = { ...SAVED_ENV };
		});

		it("stays off when OTEL_EXPORTER_OTLP_ENDPOINT is unset or empty", () => {
			delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
			startTelemetry("api-gateway" as never);
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "";
			startTelemetry("api-gateway" as never);

			expect(mockNodeSDK).not.toHaveBeenCalled();
		});

		it("starts traces only, to the endpoint of the environment", () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://collector:4318";
			startTelemetry("api-gateway" as never);

			expect(mockNodeSDK).toHaveBeenCalledWith(
				expect.objectContaining({ metricReaders: [], logRecordProcessors: [] })
			);
			expect(mockOtlpExporter).toHaveBeenCalledWith({
				url: "http://collector:4318/v1/traces",
			});
			expect(mockNodeSDK.mock.results[0].value.start).toHaveBeenCalledTimes(1);
		});
	});

	describe("shutdownTelemetry", () => {
		it("should do nothing when SDK was never initialized", async () => {
			const result = await shutdownTelemetry();
			expect(result).toBeUndefined();
		});

		it("should shutdown the SDK when it was initialized", async () => {
			process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
			startTelemetry("api-gateway" as never);

			await shutdownTelemetry();
			delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

			const instance = mockNodeSDK.mock.results[0].value;
			expect(instance.shutdown).toHaveBeenCalledTimes(1);
		});
	});
});
