import { CircuitState } from "@trading-model/common/domain/circuit-state";
import { metricsHandler } from "@trading-model/server-utils/adapters/inbound/metrics-handler";
import promClient from "prom-client";

const circuitBreakerStates = Object.values(CircuitState)
	.map((state, index) => `${index}=${state}`)
	.join(", ");

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
	help: `Circuit breaker state (${circuitBreakerStates})`,
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

export { metricsHandler };
