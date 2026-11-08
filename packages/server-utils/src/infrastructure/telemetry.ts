import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { logger } from "@trading-model/http/infrastructure/logger";
import {
	type InstanceId,
	toInstanceId,
} from "@trading-model/primitives/primitives";

let sdk: NodeSDK | null = null;

export interface TelemetryConfig {
	serviceName: ServiceInstanceName;
	serviceVersion: string;
	instanceId: InstanceId;
	otlpEndpoint?: string;
}

function _buildSdkResources(
	config: TelemetryConfig
): ReturnType<typeof resourceFromAttributes> {
	return resourceFromAttributes({
		[SemanticResourceAttributes.SERVICE_NAME]: config.serviceName,
		[SemanticResourceAttributes.SERVICE_VERSION]: config.serviceVersion,
		[SemanticResourceAttributes.SERVICE_INSTANCE_ID]: config.instanceId,
	});
}

/**
 * Starts tracing for a service from its environment (`OTEL_EXPORTER_OTLP_ENDPOINT`,
 * `APP_VERSION`, `INSTANCE_ID`); without an endpoint it does nothing.
 *
 * Must run before `express` and `https` are loaded: the instrumentations patch
 * modules when they are required, so an SDK started later records no span.
 * Each service calls it from `src/application/telemetry.ts`, the first import
 * of its entry point.
 */
export function startTelemetry(serviceName: ServiceInstanceName): void {
	initializeTelemetry({
		serviceName,
		serviceVersion: process.env.APP_VERSION ?? "1.0.0",
		instanceId: toInstanceId(process.env.INSTANCE_ID ?? serviceName),
		otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined,
	});
}

/** Starts the SDK with an explicit configuration; see {@link startTelemetry}. */
export function initializeTelemetry(config: TelemetryConfig): void {
	if (!config.otlpEndpoint) {
		logger.info("OpenTelemetry disabled (no endpoint configured)", {
			context: { service: config.serviceName },
		});
		return;
	}
	diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
	_initSdk(config);
	logger.info("OpenTelemetry initialized", {
		context: { endpoint: config.otlpEndpoint, service: config.serviceName },
	});
}

function _initSdk(config: TelemetryConfig): void {
	sdk = new NodeSDK({
		resource: _buildSdkResources(config),
		traceExporter: new OTLPTraceExporter({
			url: `${config.otlpEndpoint}/v1/traces`,
		}),
		instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
		// Traces only: metrics go through Prometheus, and the collector has no
		// metrics or logs pipeline (the SDK would export both to it by default).
		metricReaders: [],
		logRecordProcessors: [],
	});
	sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
	if (!sdk) {
		return;
	}
	try {
		await sdk.shutdown();
		logger.info("OpenTelemetry shut down");
	} catch (err) {
		logger.warn("OpenTelemetry shutdown error", {
			context: { error: (err as Error).message },
		});
	}
	sdk = null;
}
