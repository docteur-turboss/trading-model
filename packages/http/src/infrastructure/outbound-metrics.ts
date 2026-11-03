import { Counter, Gauge, Histogram } from "prom-client";

export const outboundRequestsTotal = new Counter({
	name: "http_outbound_requests_total",
	help: "Total outbound HTTP requests by service, method, and status",
	labelNames: ["service", "method", "status"] as const,
});

export const outboundRequestDurationSeconds = new Histogram({
	name: "http_outbound_request_duration_seconds",
	help: "Outbound HTTP request latency in seconds",
	labelNames: ["service", "method"] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const outboundRequestsInFlight = new Gauge({
	name: "http_outbound_requests_in_flight",
	help: "Number of outbound HTTP requests currently in flight",
	labelNames: ["service"] as const,
});
