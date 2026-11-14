import { Counter, Gauge, Histogram } from "prom-client";

/** Counter of outbound HTTP requests by service, method and status. */
export const outboundRequestsTotal = new Counter({
	name: "http_outbound_requests_total",
	help: "Total outbound HTTP requests by service, method, and status",
	labelNames: ["service", "method", "status"] as const,
});

/** Histogram of outbound HTTP request latency, in seconds. */
export const outboundRequestDurationSeconds = new Histogram({
	name: "http_outbound_request_duration_seconds",
	help: "Outbound HTTP request latency in seconds",
	labelNames: ["service", "method"] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

/** Gauge of outbound HTTP requests currently in flight. */
export const outboundRequestsInFlight = new Gauge({
	name: "http_outbound_requests_in_flight",
	help: "Number of outbound HTTP requests currently in flight",
	labelNames: ["service"] as const,
});

/** Outbound calls refused by the shared circuit breaker; `target` is a hostname or service name per `kind`. */
export const circuitBreakerRejectionsTotal = new Counter({
	name: "http_circuit_breaker_rejections_total",
	help: "Outbound HTTP calls refused by the open circuit breaker, by target and kind (hostname or service)",
	labelNames: ["target", "kind"] as const,
});

/** Inbound mTLS / ACL denials; `reason` is one of a fixed set of codes (bounded cardinality). */
export const mtlsDenialsTotal = new Counter({
	name: "http_mtls_denials_total",
	help: "Total inbound requests denied by mTLS authentication or the service ACL, by reason",
	labelNames: ["reason"] as const,
});

// Series must exist at 0 from startup: increase() ignores a series that first appears at 1.
for (const reason of [
	"non_tls",
	"unauthorized_handshake",
	"no_client_certificate",
	"identity_unresolved",
	"unauthenticated",
	"caller_unresolved",
	"caller_not_allowed",
	"no_policy",
]) {
	mtlsDenialsTotal.inc({ reason }, 0);
}
