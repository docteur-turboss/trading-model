import type { NextFunction, Request, Response } from "express";
import promClient from "prom-client";

const HTTP_REQUESTS_TOTAL = new promClient.Counter({
	name: "http_requests_total",
	help: "Total HTTP requests by method, route, and status",
	labelNames: ["method", "path", "status"] as const,
});

// Up to 30s: the latency alerts fire above 3s and 5s, and histogram_quantile
// never returns more than the largest finite bucket.
const HTTP_REQUEST_DURATION_SECONDS = new promClient.Histogram({
	name: "http_request_duration_seconds",
	help: "HTTP request latency in seconds",
	labelNames: ["method", "path"] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
});

const HTTP_REQUESTS_IN_FLIGHT = new promClient.Gauge({
	name: "http_requests_in_flight",
	help: "Number of HTTP requests currently being processed",
});

// Constant gauge at 1: joins a release (version, git_sha) to every other series.
// Values come from the image build (BUILD_VERSION, GIT_SHA); local defaults otherwise.
new promClient.Gauge({
	name: "build_info",
	help: "Build metadata of the running service (always 1)",
	labelNames: ["service", "version", "git_sha"] as const,
}).set(
	{
		service: process.env.SERVICE_NAME ?? "unknown",
		version: process.env.BUILD_VERSION ?? "dev",
		git_sha: process.env.GIT_SHA ?? "unknown",
	},
	1
);

/** Label of a request that matched no route (404, scanners): one series, not one per URL. */
export const UNMATCHED_ROUTE = "unmatched";

// The route pattern (`/v1/:service/instances`), known once the router matched:
// raw URLs carry ids and names, one series each.
function _routeLabel(req: Request): string {
	const route = (req.route as { path?: unknown } | undefined)?.path;
	if (typeof route !== "string") {
		return UNMATCHED_ROUTE;
	}
	return `${req.baseUrl}${route}`;
}

export function httpMetricsMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
): void {
	HTTP_REQUESTS_IN_FLIGHT.inc();
	const start = performance.now();

	// `close` also fires when the client aborts (no `finish`): the in-flight
	// gauge never leaks.
	res.once("close", () => {
		const duration = (performance.now() - start) / 1000;
		const path = _routeLabel(req);
		const method = req.method;

		HTTP_REQUESTS_TOTAL.inc({ method, path, status: String(res.statusCode) });
		HTTP_REQUEST_DURATION_SECONDS.observe({ method, path }, duration);
		HTTP_REQUESTS_IN_FLIGHT.dec();
	});

	next();
}
