import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";

import { ENV } from "./env";
import { logger } from "./logger";

let sdk: NodeSDK | null = null;

export function initializeTelemetry(): void {
	if (!ENV.OTEL_EXPORTER_OTLP_ENDPOINT) {
		logger.info("OpenTelemetry disabled (no endpoint configured)");
		return;
	}

	diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

	sdk = new NodeSDK(buildSdkOptions());
	sdk.start();
	logger.info("OpenTelemetry initialized", {
		context: {
			endpoint: ENV.OTEL_EXPORTER_OTLP_ENDPOINT,
		},
	});
}

function buildSdkOptions(): ConstructorParameters<typeof NodeSDK>[0] {
	return {
		resource: resourceFromAttributes({
			"service.name": ENV.APP_NAME,
			"service.version": ENV.APP_VERSION,
			"service.instance.id": ENV.INSTANCE_ID,
		}),
		traceExporter: new OTLPTraceExporter({
			url: `${ENV.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
		}),
		instrumentations: [
			new HttpInstrumentation(),
			new ExpressInstrumentation(),
			new IORedisInstrumentation(),
		],
	};
}

export async function shutdownTelemetry(): Promise<void> {
	if (sdk) {
		try {
			await sdk.shutdown();
			logger.info("OpenTelemetry shut down");
		} catch (err) {
			logger.warn("OpenTelemetry shutdown error", {
				context: {
					error: (err as Error).message,
				},
			});
		}
		sdk = null;
	}
}
