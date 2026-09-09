import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";

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

export function initializeTelemetry(config: TelemetryConfig): void {
	if (!config.otlpEndpoint) {
		_logTelemetryDisabled(config);
		return;
	}
	_diagSetup();
	_initSdk(config);
	logger.info("OpenTelemetry initialized", {
		context: { endpoint: config.otlpEndpoint, service: config.serviceName },
	});
}

function _logTelemetryDisabled(config: TelemetryConfig): void {
	logger.info("OpenTelemetry disabled (no endpoint configured)", {
		context: { service: config.serviceName },
	});
}

function _diagSetup(): void {
	diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
}

function _initSdk(config: TelemetryConfig): void {
	sdk = new NodeSDK({
		resource: _buildSdkResources(config),
		traceExporter: new OTLPTraceExporter({
			url: `${config.otlpEndpoint}/v1/traces`,
		}),
		instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
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
