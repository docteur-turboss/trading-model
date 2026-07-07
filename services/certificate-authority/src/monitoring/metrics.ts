import { logger } from "@trading-model/common/config/logger";
import type { RequestHandler } from "express";
import client from "prom-client";

const METRICS_REGISTRY = new client.Registry();

client.collectDefaultMetrics({ register: METRICS_REGISTRY });

const CERTIFICATES_SIGNED_TOTAL = new client.Counter({
	name: "ca_certificates_signed_total",
	help: "Total certificates signed by the CA",
	labelNames: ["method"],
	registers: [METRICS_REGISTRY],
});

const CERTIFICATE_SIGN_DURATION_SECONDS = new client.Histogram({
	name: "ca_certificate_sign_duration_seconds",
	help: "Duration of certificate signing operations",
	labelNames: ["method"],
	buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
	registers: [METRICS_REGISTRY],
});

const REVOKED_CERTIFICATES_TOTAL = new client.Counter({
	name: "ca_revoked_certificates_total",
	help: "Total certificates revoked",
	registers: [METRICS_REGISTRY],
});

const RENEWAL_FAILURES_TOTAL = new client.Counter({
	name: "ca_renewal_failures_total",
	help: "Total certificate renewal failures (exhausted retries)",
	labelNames: ["serviceId"],
	registers: [METRICS_REGISTRY],
});

const AUTHENTICATION_FAILURES_TOTAL = new client.Counter({
	name: "ca_authentication_failures_total",
	help: "Total authentication failures (invalid tokens, OIDC, mTLS)",
	labelNames: ["reason"],
	registers: [METRICS_REGISTRY],
});

const WORKER_POOL_SIZE = new client.Gauge({
	name: "ca_worker_pool_size",
	help: "Current number of workers in the crypto worker pool",
	registers: [METRICS_REGISTRY],
});

const WORKER_POOL_PENDING = new client.Gauge({
	name: "ca_worker_pool_pending",
	help: "Number of pending tasks in the crypto worker pool",
	registers: [METRICS_REGISTRY],
});

export function incSigned(method = "sign"): void {
	CERTIFICATES_SIGNED_TOTAL.inc({ method });
}

export function observeSignDuration(method: string, durationMs: number): void {
	CERTIFICATE_SIGN_DURATION_SECONDS.observe({ method }, durationMs / 1000);
}

export function incRevoked(): void {
	REVOKED_CERTIFICATES_TOTAL.inc();
}

export function incRenewalFailure(serviceId: string): void {
	RENEWAL_FAILURES_TOTAL.inc({ serviceId });
}

export function incAuthFailure(reason: string): void {
	AUTHENTICATION_FAILURES_TOTAL.inc({ reason });
}

export function setWorkerPoolSize(size: number): void {
	WORKER_POOL_SIZE.set(size);
}

export function setWorkerPoolPending(pending: number): void {
	WORKER_POOL_PENDING.set(pending);
}

function buildWebhookPayload(
	title: string,
	message: string,
	severity: string,
	labels?: Record<string, string>
): string {
	return JSON.stringify({
		title,
		message,
		severity,
		labels,
		timestamp: new Date().toISOString(),
		source: "certificate-authority",
	});
}

function logWebhookResult(res: Response, webhookUrl: string): void {
	if (!res.ok) {
		logger.warn("Alert webhook returned non-OK status", {
			context: {
				status: res.status,
				webhookUrl,
			},
		});
	}
}

function logWebhookError(err: unknown, webhookUrl: string): void {
	logger.warn("Alert webhook delivery failed", {
		context: {
			err: (err as Error).message,
			webhookUrl,
		},
	});
}

async function _doPostWebhook(webhookUrl: string, body: string): Promise<void> {
	const res = await fetch(webhookUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
		signal: AbortSignal.timeout(10_000),
	});
	logWebhookResult(res, webhookUrl);
}

interface SendAlertWebhookOptions {
	webhookUrl: string | undefined;
	title: string;
	message: string;
	severity?: "info" | "warning" | "error";
	labels?: Record<string, string>;
}

export async function sendAlertWebhook(options: SendAlertWebhookOptions): Promise<void> {
	const { webhookUrl, title, message, severity = "error", labels } = options;
	if (!webhookUrl) return;
	try {
		await _doPostWebhook(webhookUrl, buildWebhookPayload(title, message, severity, labels));
	} catch (err) {
		logWebhookError(err, webhookUrl);
	}
}

export const METRICS_HANDLER: RequestHandler = async (_req, res) => {
	res.setHeader("Content-Type", METRICS_REGISTRY.contentType);
	res.end(await METRICS_REGISTRY.metrics());
};

export { METRICS_REGISTRY };
