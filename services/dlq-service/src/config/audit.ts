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

class AuditClientManager {
	private _httpClient: HttpClient | null = null;
	private _httpClientPromise: Promise<HttpClient> | null = null;
	private _auditLoggerUrl: string | null | undefined;
	private _auditUrlPromise: Promise<string | null> | null = null;

	async getHttpClient(): Promise<HttpClient> {
		if (this._httpClient) {
			return this._httpClient;
		}
		const existingClient = await this._resolveExistingPromise(
			this._httpClientPromise
		);
		if (existingClient) {
			return existingClient;
		}

		this._httpClientPromise = this._createHttpClientPromise();
		return this._httpClientPromise;
	}

	private _createHttpClientPromise(): Promise<HttpClient> {
		const client = new HttpClient({
			ca: env.TLS_CA_PATH,
			cert: env.TLS_CERT_PATH,
			key: env.TLS_KEY_PATH,
		});
		this._httpClient = client;
		return Promise.resolve(client);
	}

	async resolveAuditLoggerUrl(): Promise<string | null> {
		if (this._auditLoggerUrl !== undefined) {
			return this._auditLoggerUrl;
		}
		if (await this._auditUrlPromise) {
			return this._auditUrlPromise;
		}

		this._auditUrlPromise = this._resolveUrlOrNull();
		return this._auditUrlPromise;
	}

	private async _resolveUrlOrNull(): Promise<string | null> {
		try {
			const target = await findAService(ServiceInstanceName.AuditLoggerService);
			if (target) {
				this._auditLoggerUrl = `https://${target.ip}:${target.port}`;
				return this._auditLoggerUrl;
			}
		} catch {
			logger.warn("Cannot resolve audit-logger URL via address-manager");
		}
		this._auditLoggerUrl = null;
		return null;
	}

	private async _resolveExistingPromise<T>(
		promise: Promise<T> | null
	): Promise<T | null> {
		return promise === null ? null : await promise;
	}
}

const auditClientManager = new AuditClientManager();

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
		await _sendAuditEvent(event);
		auditCircuitBreaker.recordSuccess();
	} catch (err) {
		auditCircuitBreaker.recordFailure();
		_logAuditFailure(err, event);
	}
}

async function _sendAuditEvent(event: AuditEvent): Promise<void> {
	const url = await auditClientManager.resolveAuditLoggerUrl();
	if (!url) {
		return;
	}
	const client = await auditClientManager.getHttpClient();
	await client.post(`${url}/audit`, event, {
		timeoutMs: 5000,
		serviceName: ServiceInstanceName.AuditLoggerService,
		retryCount: 2,
	});
}

function _logAuditFailure(err: unknown, event: AuditEvent): void {
	logger.warn("Audit notification failed (non-fatal)", {
		error: (err as Error)?.message,
		topic: event.topic,
	});
}
