import promClient from "prom-client";
import { metricsHandler } from "@trading-model/common/server/metrics-handler";

promClient.collectDefaultMetrics({ prefix: "audit_" });

export const LOGS_INGESTED_TOTAL = new promClient.Counter({
	name: "audit_logs_ingested_total",
	help: "Total service logs ingested",
	labelNames: ["level", "service_name"] as const,
});

export const LOGS_STORED_TOTAL = new promClient.Counter({
	name: "audit_logs_stored_total",
	help: "Total service logs persisted to MongoDB",
	labelNames: ["status"] as const,
});

export const EVENTS_INGESTED_TOTAL = new promClient.Counter({
	name: "audit_events_ingested_total",
	help: "Total audit events ingested",
	labelNames: ["topic"] as const,
});

export const EVENTS_STORED_TOTAL = new promClient.Counter({
	name: "audit_events_stored_total",
	help: "Total audit events persisted to MongoDB",
	labelNames: ["status"] as const,
});

export const EVENTS_QUERY_DURATION_SECONDS = new promClient.Histogram({
	name: "audit_events_query_duration_seconds",
	help: "Audit event query latency in seconds",
	buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

export const JOB_COUNT = new promClient.Gauge({
	name: "audit_job_count",
	help: "Number of active jobs",
	labelNames: ["status"] as const,
});

export const BACKPRESSURE_RATIO = new promClient.Gauge({
	name: "audit_backpressure_ratio",
	help: "Backpressure ratio (0=idle, 1=full)",
});

export const WORKER_COUNT = new promClient.Gauge({
	name: "audit_worker_count",
	help: "Number of registered workers",
	labelNames: ["status"] as const,
});

export const ORPHAN_JOBS_TOTAL = new promClient.Counter({
	name: "audit_orphan_jobs_total",
	help: "Total orphan jobs detected and recovered",
});

export { metricsHandler };
