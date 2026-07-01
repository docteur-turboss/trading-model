import { Request, Response } from 'express';
import promClient from 'prom-client';

promClient.collectDefaultMetrics({ prefix: 'audit_' });

export const eventsIngestedTotal = new promClient.Counter({
  name: 'audit_events_ingested_total',
  help: 'Total audit events ingested',
  labelNames: ['topic'] as const,
});

export const eventsStoredTotal = new promClient.Counter({
  name: 'audit_events_stored_total',
  help: 'Total audit events persisted to MongoDB',
  labelNames: ['status'] as const,
});

export const eventsQueryDurationSeconds = new promClient.Histogram({
  name: 'audit_events_query_duration_seconds',
  help: 'Audit event query latency in seconds',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const jobCount = new promClient.Gauge({
  name: 'audit_job_count',
  help: 'Number of active jobs',
  labelNames: ['status'] as const,
});

export const backpressureRatio = new promClient.Gauge({
  name: 'audit_backpressure_ratio',
  help: 'Backpressure ratio (0=idle, 1=full)',
});

export const workerCount = new promClient.Gauge({
  name: 'audit_worker_count',
  help: 'Number of registered workers',
  labelNames: ['status'] as const,
});

export const orphanJobsTotal = new promClient.Counter({
  name: 'audit_orphan_jobs_total',
  help: 'Total orphan jobs detected and recovered',
});

export function metricsHandler(_req: Request, res: Response): void {
  res.set('Content-Type', promClient.register.contentType);
  promClient.register.metrics().then(data => res.send(data));
}
