import { logger } from "@trading-model/common/config/logger";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";

interface SendAlertWebhookOptions {
	webhookUrl: string | undefined;
	title: string;
	message: string;
	severity?: "info" | "warning" | "error";
	labels?: Record<string, string>;
}

function buildPayload(
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
		source: ServiceInstanceName.CertificateAuthorityService,
	});
}

function logResult(res: Response, webhookUrl: string): void {
	if (!res.ok) {
		logger.warn("Alert webhook returned non-OK status", {
			context: {
				status: res.status,
				webhookUrl,
			},
		});
	}
}

function logError(err: unknown, webhookUrl: string): void {
	logger.warn("Alert webhook delivery failed", {
		context: {
			err: (err as Error).message,
			webhookUrl,
		},
	});
}

export async function sendAlertWebhook(
	options: SendAlertWebhookOptions
): Promise<void> {
	const { webhookUrl, title, message, severity = "error", labels } = options;
	if (!webhookUrl) {
		return;
	}
	try {
		const body = buildPayload(title, message, severity, labels);
		const res = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body,
			signal: AbortSignal.timeout(10_000),
		});
		logResult(res, webhookUrl);
	} catch (err) {
		logError(err, webhookUrl);
	}
}
