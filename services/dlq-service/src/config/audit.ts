import { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	DurationMs,
	PositiveInt,
	toServiceId,
	URLString,
} from "@trading-model/common/domain/primitives";
import { HostPort } from "@trading-model/common/domain/service-identity";
import { buildTlsFromEnv } from "@trading-model/common/domain/tls-paths";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import type { AuditEvent } from "@trading-model/validation/adapters/inbound/admin/audit.dto";
import { ENV } from "../infrastructure/config/env";
import { FIND_A_SERVICE } from "./address-manager";
import { logger } from "./logger";

class LazyHttpClient {
	private _client: HttpClient | null = null;

	get(): Promise<HttpClient> {
		if (!this._client) {
			this._client = new HttpClient(buildTlsFromEnv(ENV));
		}
		return Promise.resolve(this._client);
	}
}

class AuditUrlResolver {
	private _urlPromise: Promise<string | null> | null = null;

	resolve(): Promise<string | null> {
		if (!this._urlPromise) {
			this._urlPromise = this._resolveUrl();
		}
		return this._urlPromise;
	}

	private async _resolveUrl(): Promise<string | null> {
		try {
			const target = await FIND_A_SERVICE(
				ServiceInstanceName.AuditLoggerService
			);
			if (target) {
				return `https://${HostPort.toAddress(target)}`;
			}
		} catch {
			logger.warn("Cannot resolve audit-logger URL via address-manager");
		}
		return null;
	}
}

const httpClient = new LazyHttpClient();
const urlResolver = new AuditUrlResolver();

const auditCircuitBreaker = new CircuitStateMachine({
	failureThreshold: 10,
	cooldownMs: DurationMs.of(60_000),
	halfOpenMaxAttempts: 1,
	onOpen: (state) => {
		logger.warn(
			`audit-logger circuit breaker ${state.previousState === "half-open" ? "re-opened during half-open" : "opened"}`,
			{
				failures: state.failures,
				halfOpenAttempts: state.halfOpenAttempts,
			}
		);
	},
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
	const url = await urlResolver.resolve();
	if (!url) {
		return;
	}
	const client = await httpClient.get();
	await client.post(URLString.of(`${url}/audit`), event, {
		timeoutMs: DurationMs.of(5000),
		serviceName: toServiceId(ServiceInstanceName.AuditLoggerService),
		retryCount: PositiveInt.of(2),
	});
}

function _logAuditFailure(err: unknown, event: AuditEvent): void {
	logger.warn("Audit notification failed (non-fatal)", {
		error: (err as Error)?.message,
		topic: event.topic,
	});
}
