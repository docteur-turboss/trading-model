import type { Request, Response } from "express";
import promClient from "prom-client";

promClient.collectDefaultMetrics({ prefix: "mm_" });

export const MESSAGES_PUBLISHED_TOTAL = new promClient.Counter({
	name: "mm_messages_published_total",
	help: "Total number of messages published",
	labelNames: ["topic"] as const,
});

export const MESSAGES_DELIVERED_TOTAL = new promClient.Counter({
	name: "mm_messages_delivered_total",
	help: "Total number of messages delivered",
	labelNames: ["topic", "status"] as const,
});

export const MESSAGES_DLQ_TOTAL = new promClient.Counter({
	name: "mm_messages_dlq_total",
	help: "Total number of messages sent to DLQ",
	labelNames: ["topic", "reason"] as const,
});

export const MESSAGES_DLQ_ERROR_TOTAL = new promClient.Counter({
	name: "mm_messages_dlq_error_total",
	help: "Total number of DLQ storage errors (file or service)",
	labelNames: ["target"] as const,
});

export const DELIVERY_LATENCY_SECONDS = new promClient.Histogram({
	name: "mm_delivery_latency_seconds",
	help: "Message delivery latency in seconds",
	labelNames: ["topic"] as const,
	buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

export const SUBSCRIPTION_COUNT = new promClient.Gauge({
	name: "mm_subscription_count",
	help: "Number of active subscriptions",
	labelNames: ["topic"] as const,
});

export const CIRCUIT_BREAKER_STATE = new promClient.Gauge({
	name: "mm_circuit_breaker_state",
	help: "Circuit breaker state (0=closed, 1=open, 2=half-open)",
	labelNames: ["subscriber"] as const,
});

export const REDIS_STREAM_SIZE = new promClient.Gauge({
	name: "mm_redis_stream_size",
	help: "Size of Redis stream per topic",
	labelNames: ["topic"] as const,
});

export const IN_FLIGHT_MESSAGES = new promClient.Gauge({
	name: "mm_in_flight_messages",
	help: "Number of messages currently being delivered",
});

export const BACKPRESSURE_RATIO = new promClient.Gauge({
	name: "mm_backpressure_ratio",
	help: "Token bucket usage ratio (0=idle, 1=full)",
});

export const WSS_CONNECTION_COUNT = new promClient.Gauge({
	name: "mm_wss_connections",
	help: "Number of active WSS connections",
});

export const SUBSCRIBER_DELIVERY_CONCURRENCY = new promClient.Gauge({
	name: "mm_subscriber_delivery_concurrency",
	help: "Current delivery concurrency per subscriber",
	labelNames: ["subscriber"] as const,
});

export const REDIS_STREAM_LAG = new promClient.Gauge({
	name: "mm_redis_stream_lag_ms",
	help: "Redis stream lag in milliseconds per topic",
	labelNames: ["topic"] as const,
});

export const DLQ_BUFFER_SIZE = new promClient.Gauge({
	name: "mm_dlq_buffer_size",
	help: "Current DLQ buffer size",
});

export const BUFFER_DROPPED_TOTAL = new promClient.Counter({
	name: "mm_buffer_dropped_total",
	help: "Total number of messages dropped due to buffer overflow",
	labelNames: ["buffer", "reason"] as const,
});

export function metricsHandler(_req: Request, res: Response): void {
	res.set("Content-Type", promClient.register.contentType);
	promClient.register.metrics().then((data) => res.send(data));
}

/*
 * ─── Recommended Prometheus/Grafana alerting rules ────────────────────────────
 *
 * # Critical: messages being dropped because all persistence layers exhausted
 * - alert: BufferDropped
 *   expr: rate(mm_buffer_dropped_total[5m]) > 0
 *   for: 1m
 *   labels: { severity: critical }
 *
 * # Critical: messages routed to DLQ (may indicate subscriber issues)
 * - alert: HighDLQRate
 *   expr: rate(mm_messages_dlq_total[5m]) > 10
 *   for: 2m
 *   labels: { severity: critical }
 *
 * # Warning: DLQ storage errors (Redis fallback persists but DLQ service down)
 * - alert: DLQStorageErrors
 *   expr: rate(mm_messages_dlq_error_total[5m]) > 0
 *   for: 1m
 *   labels: { severity: warning }
 *
 * # Critical: circuit breaker open — subscriber not receiving messages
 * - alert: CircuitBreakerOpen
 *   expr: mm_circuit_breaker_state == 1
 *   for: 1m
 *   labels: { severity: critical }
 *
 * # Warning: high backpressure ratio (token bucket near capacity)
 * - alert: HighBackpressure
 *   expr: mm_backpressure_ratio > 0.8
 *   for: 5m
 *   labels: { severity: warning }
 *
 * # Critical: Redis stream lag growing (subscriber can't keep up)
 * - alert: StreamLagGrowing
 *   expr: rate(mm_redis_stream_lag_ms[5m]) > 0
 *   for: 5m
 *   labels: { severity: warning }
 *
 * # Warning: subscriber delivery concurrency saturated
 * - alert: SubscriberSaturated
 *   expr: mm_subscriber_delivery_concurrency > 8
 *   for: 5m
 *   labels: { severity: warning }
 *
 * # Critical: WSS connections dropped (network / broker issue)
 * - alert: WSSConnectionsDropped
 *   expr: rate(mm_wss_connections[1m]) < -1
 *   for: 30s
 *   labels: { severity: critical }
 */
