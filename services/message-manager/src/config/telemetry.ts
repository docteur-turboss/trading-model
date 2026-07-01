import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

import { env } from './env';
import { logger } from './logger';

let sdk: NodeSDK | null = null;

export function initializeTelemetry(): void {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.info('OpenTelemetry disabled (no endpoint configured)');
    return;
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

  sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: env.APP_NAME,
      [SemanticResourceAttributes.SERVICE_VERSION]: env.APP_VERSION,
      [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: env.INSTANCE_ID,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
    }),
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new IORedisInstrumentation(),
    ],
  });

  sdk.start();
  logger.info('OpenTelemetry initialized', { endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT });
}

export async function shutdownTelemetry(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      logger.info('OpenTelemetry shut down');
    } catch (err) {
      logger.warn('OpenTelemetry shutdown error', { error: (err as Error).message });
    }
    sdk = null;
  }
}
