import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { MongoDBInstrumentation } from "@opentelemetry/instrumentation-mongodb";
import { MySQL2Instrumentation } from "@opentelemetry/instrumentation-mysql2";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { InstanceId } from "@trading-model/primitives/primitives";
import { logger } from "./logger";

let sdk: NodeSDK | null = null;

/** Aborts an OTLP request to a silent collector: its open socket would hold the process past the 10 s stop grace. */
const EXPORT_TIMEOUT_MS = 2000;

const PROBE_PATHS = new Set(["/ping", "/health/ready", "/metrics"]);

/** True for probe and scrape requests, which must not create a trace (they would evict real ones). */
export function isProbeRequest(req: { url?: string }): boolean {
	return PROBE_PATHS.has((req.url ?? "").split("?")[0]);
}

/** HTTP instrumentation without the caller's User-Agent and query string on incoming spans (privacy notice, Art. 13): hook attributes are applied last and OTel drops `undefined`. */
export const createHttpInstrumentation = () =>
	new HttpInstrumentation({
		ignoreIncomingRequestHook: isProbeRequest,
		startIncomingSpanHook: () => ({
			"user_agent.original": undefined,
			"url.query": undefined,
		}),
	});

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
	const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || undefined;
	if (!otlpEndpoint) {
		logger.info("OpenTelemetry disabled (no endpoint configured)", {
			context: { service: serviceName },
		});
		return;
	}
	diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
	sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[SemanticResourceAttributes.SERVICE_NAME]: serviceName,
			[SemanticResourceAttributes.SERVICE_VERSION]:
				process.env.APP_VERSION ?? "1.0.0",
			[SemanticResourceAttributes.SERVICE_INSTANCE_ID]: InstanceId.of(
				process.env.INSTANCE_ID ?? serviceName
			),
		}),
		traceExporter: new OTLPTraceExporter({
			url: `${otlpEndpoint}/v1/traces`,
			timeoutMillis: EXPORT_TIMEOUT_MS,
		}),
		instrumentations: [
			createHttpInstrumentation(),
			new ExpressInstrumentation(),
			// No query values in spans: mysql2 masks literals, mongodb replaces
			// them by default, redis keeps the command name only (no key, no value).
			new MySQL2Instrumentation({ maskStatement: true }),
			new MongoDBInstrumentation(),
			new IORedisInstrumentation({ dbStatementSerializer: (cmd) => cmd }),
		],
		// Traces only: metrics go through Prometheus, and the collector has no
		// metrics or logs pipeline (the SDK would export both to it by default).
		metricReaders: [],
		logRecordProcessors: [],
	});
	sdk.start();
	logger.info("OpenTelemetry initialized", {
		context: { endpoint: otlpEndpoint, service: serviceName },
	});
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
			context: { error: normalizeError(err).message },
		});
	}
	sdk = null;
}
