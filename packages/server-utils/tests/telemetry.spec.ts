const mockNodeSDK = jest.fn().mockImplementation(() => ({
	start: jest.fn(),
	shutdown: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@opentelemetry/sdk-node", () => ({
	NodeSDK: mockNodeSDK,
}));

jest.mock("@opentelemetry/exporter-trace-otlp-http", () => ({
	OTLPTraceExporter: jest.fn(),
}));

import {
	initializeTelemetry,
	shutdownTelemetry,
} from "../src/server/telemetry";

const BASE_CONFIG = {
	serviceName: "test-service" as never,
	serviceVersion: "1.0.0",
	instanceId: "test-instance" as never,
};

describe("telemetry", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("initializeTelemetry", () => {
		it("should not create an SDK when otlpEndpoint is not provided", () => {
			initializeTelemetry({ ...BASE_CONFIG });

			expect(mockNodeSDK).not.toHaveBeenCalled();
		});

		it("should create an SDK when otlpEndpoint is provided", () => {
			initializeTelemetry({
				...BASE_CONFIG,
				otlpEndpoint: "http://localhost:4318",
			});

			expect(mockNodeSDK).toHaveBeenCalledTimes(1);
			expect(mockNodeSDK).toHaveBeenCalledWith(
				expect.objectContaining({
					traceExporter: expect.any(Object),
					instrumentations: expect.arrayContaining([expect.any(Object)]),
				})
			);
		});

		it("should start the SDK when otlpEndpoint is provided", () => {
			initializeTelemetry({
				...BASE_CONFIG,
				otlpEndpoint: "http://localhost:4318",
			});

			const instance = mockNodeSDK.mock.results[0].value;
			expect(instance.start).toHaveBeenCalledTimes(1);
		});
	});

	describe("shutdownTelemetry", () => {
		it("should do nothing when SDK was never initialized", async () => {
			const result = await shutdownTelemetry();
			expect(result).toBeUndefined();
		});

		it("should shutdown the SDK when it was initialized", async () => {
			initializeTelemetry({
				...BASE_CONFIG,
				otlpEndpoint: "http://localhost:4318",
			});

			await shutdownTelemetry();

			const instance = mockNodeSDK.mock.results[0].value;
			expect(instance.shutdown).toHaveBeenCalledTimes(1);
		});
	});
});
