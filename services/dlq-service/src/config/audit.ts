import { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { AuditEvent } from "@trading-model/common/contracts/admin/audit.dto";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { FIND_A_SERVICE } from "./address-manager";
import { ENV } from "./env";
import { logger } from "./logger";

class LazyHttpClient {
	private _client: HttpClient | null = null;

	get(): Promise<HttpClient> {
		if (!this._client) {
			this._client = new HttpClient({
				ca: ENV.TLS_CA_PATH,
				cert: ENV.TLS_CERT_PATH,
				key: ENV.TLS_KEY_PATH,
			});
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
				return `https://${target.ip}:${target.port}`;
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
	cooldownMs: 60_000,
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
