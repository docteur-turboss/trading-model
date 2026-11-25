import { metricsHandler } from "@trading-model/http/metrics-handler";
import { CircuitState } from "@trading-model/primitives/circuit-state";
import promClient from "prom-client";

const circuitBreakerStates = Object.values(CircuitState)
	.map((state, index) => `${index}=${state}`)
	.join(", ");

export const MESSAGES_PUBLISHED_TOTAL = new promClient.Counter({
	name: "mm_messages_published_total",
	help: "Total number of messages published",
	labelNames: ["topic"] as const,
});

export const DELIVERY_LATENCY_SECONDS = new promClient.Histogram({
	name: "mm_delivery_latency_seconds",
	help: "Message delivery latency in seconds",
	labelNames: ["topic"] as const,
	buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
});

export const SUBSCRIPTION_COUNT = new promClient.Gauge({
	name: "mm_subscription_count",
	help: "Number of subscribed services (one delivery each per message)",
	labelNames: ["topic"] as const,
});

export const CIRCUIT_BREAKER_STATE = new promClient.Gauge({
	name: "mm_circuit_breaker_state",
	help: `Circuit breaker state (${circuitBreakerStates})`,
	labelNames: ["subscriber"] as const,
});

export const IN_FLIGHT_MESSAGES = new promClient.Gauge({
	name: "mm_in_flight_messages",
	help: "Number of messages currently being delivered",
});

export const SUBSCRIBER_DELIVERY_CONCURRENCY = new promClient.Gauge({
	name: "mm_subscriber_delivery_concurrency",
	help: "Current delivery concurrency per subscriber",
	labelNames: ["subscriber"] as const,
});

export {
	BUS_DEAD_LETTERS,
	JOURNAL_OLDEST_PENDING_AGE_SECONDS,
	JOURNAL_PENDING_ENTRIES,
	MESSAGES_DELIVERED_TOTAL,
	MESSAGES_DLQ_TOTAL,
	MESSAGES_UNROUTED_TOTAL,
} from "@trading-model/broker-message/bus/metrics";
export { metricsHandler };
