import { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";

import { findAService } from "./address-manager";
import { env } from "./env";
import { logger } from "./logger";
import { MessageManagerCircuitBreaker } from "./mm-circuit-breaker";

export interface AuditEvent {
	timestamp: string;
	topic: string;
	publisher: string;
	correlationId: string;
	summary: string;
	severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
}

let httpClient: HttpClient | null = null;
let httpClientPromise: Promise<HttpClient> | null = null;

async function getAuditHttpClient(): Promise<HttpClient> {
	if (httpClient) {
		return httpClient;
	}
	const existingClient =
		httpClientPromise === null ? null : await httpClientPromise;
	if (existingClient) {
		return existingClient;
	}

	httpClientPromise = (() => {
		const client = new HttpClient({
			ca: env.TLS_CA_PATH,
			cert: env.TLS_CERT_PATH,
			key: env.TLS_KEY_PATH,
		});
		httpClient = client;
		return Promise.resolve(client);
	})();

	return httpClientPromise;
}

let auditLoggerUrl: string | null | undefined;
let auditUrlPromise: Promise<string | null> | null = null;

async function resolveAuditLoggerUrl(): Promise<string | null> {
	if (auditLoggerUrl !== undefined) {
		return auditLoggerUrl;
	}
	if (await auditUrlPromise) {
		return auditUrlPromise;
	}

	auditUrlPromise = (async () => {
		try {
			const target = await findAService(ServiceInstanceName.AuditLoggerService);
			if (target) {
				auditLoggerUrl = `https://${target.ip}:${target.port}`;
				return auditLoggerUrl;
			}
		} catch {
			logger.warn("Cannot resolve audit-logger URL via address-manager");
		}
		auditLoggerUrl = null;
		return null;
	})();

	return auditUrlPromise;
}

const auditCircuitBreaker = new MessageManagerCircuitBreaker({
	failureThreshold: 10,
	resetMs: 60_000,
	halfOpenMaxAttempts: 1,
	name: "audit-logger",
});

export async function notifyAudit(event: AuditEvent): Promise<void> {
	if (auditCircuitBreaker.isOpen()) {
		return;
	}

	try {
		const url = await resolveAuditLoggerUrl();
		if (!url) {
			return;
		}

		const client = await getAuditHttpClient();
		await client.post(`${url}/audit`, event, {
			timeoutMs: 5000,
			serviceName: ServiceInstanceName.AuditLoggerService,
			retryCount: 2,
		});
		auditCircuitBreaker.recordResult(true);
	} catch (err) {
		auditCircuitBreaker.recordResult(false);
		logger.warn("Audit notification failed (non-fatal)", {
			error: (err as Error)?.message,
			topic: event.topic,
		});
	}
}
