import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

import { logger } from "../config/logger";

let sdk: NodeSDK | null = null;

export interface TelemetryConfig {
	serviceName: string;
	serviceVersion: string;
	instanceId: string;
	otlpEndpoint?: string;
}

export function initializeTelemetry(config: TelemetryConfig): void {
	if (!config.otlpEndpoint) {
		logger.info("OpenTelemetry disabled (no endpoint configured)", {
			service: config.serviceName,
		});
		return;
	}

	diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

	sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
			[SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion,
			[SemanticResourceAttributes.SERVICE_INSTANCE_ID]: config.instanceId,
		}),
		traceExporter: new OTLPTraceExporter({
			url: `${config.otlpEndpoint}/v1/traces`,
		}),
		instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
	});

	sdk.start();
	logger.info("OpenTelemetry initialized", {
		endpoint: config.otlpEndpoint,
		service: config.serviceName,
	});
}

export async function shutdownTelemetry(): Promise<void> {
	if (sdk) {
		try {
			await sdk.shutdown();
			logger.info("OpenTelemetry shut down");
		} catch (err) {
			logger.warn("OpenTelemetry shutdown error", {
				error: (err as Error).message,
			});
		}
		sdk = null;
	}
}
