import promClient from "prom-client";
import { metricsHandler } from "@trading-model/common/server/metrics-handler";

promClient.collectDefaultMetrics({ prefix: "gw_" });

export const HTTP_REQUESTS_TOTAL = new promClient.Counter({
	name: "gw_http_requests_total",
	help: "Total HTTP requests by method, path, and status",
	labelNames: ["method", "path", "status"] as const,
});

export const HTTP_REQUEST_DURATION_SECONDS = new promClient.Histogram({
	name: "gw_http_request_duration_seconds",
	help: "HTTP request latency in seconds",
	labelNames: ["method", "path"] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

export const PROXY_REQUEST_DURATION_SECONDS = new promClient.Histogram({
	name: "gw_proxy_request_duration_seconds",
	help: "Upstream proxy request latency in seconds",
	labelNames: ["service", "status"] as const,
	buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10],
});

export const CACHE_HIT_RATIO = new promClient.Gauge({
	name: "gw_cache_hit_ratio",
	help: "Cache hit ratio (0-1)",
});

export const CACHE_SIZE = new promClient.Gauge({
	name: "gw_cache_size",
	help: "Number of entries in the response cache",
});

export const AUTH_FAILURES_TOTAL = new promClient.Counter({
	name: "gw_auth_failures_total",
	help: "Total authentication failures",
});

export const SERVICE_ERRORS_TOTAL = new promClient.Counter({
	name: "gw_service_errors_total",
	help: "Total upstream service errors by service name",
	labelNames: ["service"] as const,
});

export const ACTIVE_REQUESTS = new promClient.Gauge({
	name: "gw_active_requests",
	help: "Number of currently active requests",
});

export { metricsHandler };
