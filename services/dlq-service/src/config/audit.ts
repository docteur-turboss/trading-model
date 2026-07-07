import { HttpClient } from "@trading-model/common/config/http-client";
import type { CorrelationId, UnixTimestamp } from "@trading-model/common/domain/primitives";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";

import { findAService } from "./address-manager";
import { ENV } from "./env";
import { logger } from "./logger";
import { MessageManagerCircuitBreaker } from "./mm-circuit-breaker";

export interface AuditEvent {
	timestamp: UnixTimestamp;
	topic: string;
	publisher: string;
	correlationId: CorrelationId;
	summary: string;
	severity: "INFO" | "WARNING" | "ERROR" | "CRITICAL";
}

class AuditClientManager {
	private _httpClient: HttpClient | null = null;
	private _resolveHttpClientPromise: Promise<void> | null = null;
	private _auditLoggerUrl: string | null = null;
	private _resolveAuditUrlPromise: Promise<void> | null = null;

	async getHttpClient(): Promise<HttpClient> {
		if (this._httpClient) {
			return this._httpClient;
		}
		if (this._resolveHttpClientPromise) {
			await this._resolveHttpClientPromise;
			return this._httpClient!;
		}

		this._resolveHttpClientPromise = this._resolveHttpClient();
		await this._resolveHttpClientPromise;
		return this._httpClient!;
	}

	private async _resolveHttpClient(): Promise<void> {
		this._httpClient = new HttpClient({
			ca: ENV.TLS_CA_PATH,
			cert: ENV.TLS_CERT_PATH,
			key: ENV.TLS_KEY_PATH,
		});
	}

	async resolveAuditLoggerUrl(): Promise<string | null> {
		if (this._resolveAuditUrlPromise) {
			await this._resolveAuditUrlPromise;
			return this._auditLoggerUrl;
		}

		this._resolveAuditUrlPromise = this._resolveUrl();
		await this._resolveAuditUrlPromise;
		return this._auditLoggerUrl;
	}

	private async _resolveUrl(): Promise<void> {
		try {
			const target = await findAService(ServiceInstanceName.AuditLoggerService);
			if (target) {
				this._auditLoggerUrl = `https://${target.ip}:${target.port}`;
				return;
			}
		} catch {
			logger.warn("Cannot resolve audit-logger URL via address-manager");
		}
		this._auditLoggerUrl = null;
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

