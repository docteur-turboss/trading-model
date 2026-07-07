import type { HostPort } from "../domain/service-identity";
import type { TlsPaths } from "../domain/tls-paths";
import type { logger } from "./logger";
import { ServiceInstanceName } from "./services.types";

interface ServiceResolver {
	findService(name: string): Promise<HostPort | null>;
}

/**
 * Configures the shared logger to ship logs to the audit-logger service.
 * Uses lazy resolution: re-resolves the audit-logger URL every flush cycle
 * until successful, then caches until the next delivery failure.
 *
 * Call once per service in onStart:
 *   await setupAuditLogging(logger, addressManager, {
 *     key: env.TLS_KEY_PATH, cert: env.TLS_CERT_PATH, ca: env.TLS_CA_PATH,
 *   });
 */
function _buildAuditResolver(
	loggerInstance: typeof logger,
	addressManager: ServiceResolver,
	tlsPaths: TlsPaths
): () => Promise<{ url: string; tls: TlsPaths } | null> {
	let connected = false;
	return async () => {
		try {
			const target = await addressManager.findService(
				ServiceInstanceName.AuditLoggerService
			);
			if (!target) {
				return null;
			}
			_logFirstConnection(loggerInstance, target, connected);
			connected = true;
			return { url: `https://${target.host}:${target.port}`, tls: tlsPaths };
		} catch {
			return null;
		}
	};
}

export function setupAuditLogging(
	loggerInstance: typeof logger,
	addressManager: ServiceResolver,
	tlsPaths: TlsPaths
): void {
	loggerInstance.setAuditResolver(
		_buildAuditResolver(loggerInstance, addressManager, tlsPaths)
	);
}

function _logFirstConnection(
	loggerInstance: typeof logger,
	target: HostPort,
	alreadyConnected: boolean
): void {
	if (!alreadyConnected) {
		loggerInstance.info("audit-logger: connected", {
			url: `${target.host}:${target.port}`,
		});
	}
}

export type { ServiceResolver };
