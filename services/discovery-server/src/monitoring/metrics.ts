import { RequestHandler } from 'express';
import client from 'prom-client';

const register = new client.Registry();

client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'discovery_http_requests_total',
  help: 'Total HTTP requests by method, path, and status',
  labelNames: ['method', 'path', 'status'],
  registers: [register],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'discovery_http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const activeConnections = new client.Gauge({
  name: 'discovery_ws_active_connections',
  help: 'Number of currently connected WebSocket clients',
  registers: [register],
});

const registeredInstances = new client.Gauge({
  name: 'discovery_registered_instances',
  help: 'Number of registered service instances',
  registers: [register],
});

const registeredInstancesPerService = new client.Gauge({
  name: 'discovery_registered_instances_per_service',
  help: 'Number of registered service instances per service',
  labelNames: ['service'] as const,
  registers: [register],
});

const heartbeatsTotal = new client.Counter({
  name: 'discovery_heartbeats_total',
  help: 'Total heartbeats received per service',
  labelNames: ['service'] as const,
  registers: [register],
});

const cacheInvalidationsTotal = new client.Counter({
  name: 'discovery_cache_invalidations_total',
  help: 'Total cache invalidation events broadcast',
  registers: [register],
});

const cleanupDurationSeconds = new client.Histogram({
  name: 'discovery_cleanup_duration_seconds',
  help: 'Duration of lease cleanup cycles',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [register],
});

const wsDroppedMessagesTotal = new client.Counter({
  name: 'discovery_ws_dropped_messages_total',
  help: 'Total WebSocket messages dropped due to queue overflow',
  registers: [register],
});

const operationErrorsTotal = new client.Counter({
  name: 'discovery_operation_errors_total',
  help: 'Total operation errors by type',
  labelNames: ['operation'] as const,
  registers: [register],
});

const leaseCleanupCyclesTotal = new client.Counter({
  name: 'discovery_lease_cleanup_cycles_total',
  help: 'Total lease cleanup cycles executed',
  registers: [register],
});

export function trackRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number
): void {
  httpRequestsTotal.inc({ method, path, status });
  httpRequestDurationSeconds.observe({ method, path }, durationMs / 1000);
}

export function setActiveWsConnections(count: number): void {
  activeConnections.set(count);
}

export function setRegisteredInstances(count: number): void {
  registeredInstances.set(count);
}

export function setRegisteredInstancesPerService(service: string, count: number): void {
  registeredInstancesPerService.set({ service }, count);
}

export function incHeartbeatsTotal(service: string): void {
  heartbeatsTotal.inc({ service });
}

export function incCacheInvalidations(): void {
  cacheInvalidationsTotal.inc();
}

export function observeCleanupDuration(durationMs: number): void {
  cleanupDurationSeconds.observe(durationMs / 1000);
}

export function incWsDroppedMessages(): void {
  wsDroppedMessagesTotal.inc();
}

export function incOperationError(operation: string): void {
  operationErrorsTotal.inc({ operation });
}

export function incLeaseCleanupCycle(): void {
  leaseCleanupCyclesTotal.inc();
}

export const metricsHandler: RequestHandler = async (_req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
};

export { register };
