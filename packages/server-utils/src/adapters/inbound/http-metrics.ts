import type { NextFunction, Request, Response } from "express";
import promClient from "prom-client";

const HTTP_REQUESTS_TOTAL = new promClient.Counter({
	name: "http_requests_total",
	help: "Total HTTP requests by method, path, and status",
	labelNames: ["method", "path", "status"] as const,
});

const HTTP_REQUEST_DURATION_SECONDS = new promClient.Histogram({
	name: "http_request_duration_seconds",
	help: "HTTP request latency in seconds",
	labelNames: ["method", "path"] as const,
	buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

const HTTP_REQUESTS_IN_FLIGHT = new promClient.Gauge({
	name: "http_requests_in_flight",
	help: "Number of HTTP requests currently being processed",
});

function _normalizePath(path: string): string {
	return path.replace(/\/\d+/g, "/:id");
}

export function httpMetricsMiddleware(
	req: Request,
	res: Response,
	next: NextFunction
): void {
	const path = _normalizePath(req.path);
	const method = req.method;

	HTTP_REQUESTS_IN_FLIGHT.inc();

	const start = performance.now();

	res.on("finish", () => {
		const duration = (performance.now() - start) / 1000;
		const status = String(res.statusCode);

		HTTP_REQUESTS_TOTAL.inc({ method, path, status });
		HTTP_REQUEST_DURATION_SECONDS.observe({ method, path }, duration);
		HTTP_REQUESTS_IN_FLIGHT.dec();
	});

	next();
}
