import type { Metric } from "web-vitals";
import { getAdminToken } from "../api/_request";

export type TelemetryEvent =
	| { type: "vital"; name: string; value: number; rating?: string }
	| { type: "error"; name: string; message?: string; stack?: string };

const API_BASE = import.meta.env.VITE_API_GATEWAY_URL ?? "/v1";
const TELEMETRY_ENDPOINT =
	(import.meta.env.VITE_TELEMETRY_ENDPOINT as string | undefined) ??
	`${API_BASE}/telemetry`;

function sendEvent(event: TelemetryEvent): void {
	if (typeof fetch === "undefined") {
		return;
	}
	void fetch(TELEMETRY_ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": getAdminToken(),
		},
		body: JSON.stringify(event),
		keepalive: true,
	}).catch(() => {
		// Best-effort telemetry — never surface to the user.
	});
}

export function reportMetric(metric: Metric): void {
	sendEvent({
		type: "vital",
		name: metric.name,
		value: metric.value,
		rating: metric.rating,
	});
}

export function reportError(
	error: unknown,
	info?: { componentStack?: string | null }
): void {
	const err = error instanceof Error ? error : new Error(String(error));
	sendEvent({
		type: "error",
		name: err.name || "Error",
		message: err.message,
		stack: err.stack ?? info?.componentStack ?? undefined,
	});
}
