import type { IPAddress, Port } from "../domain/primitives";
import type { TlsPaths } from "../domain/tls-paths";
import type { logger } from "./logger";
import { ServiceInstanceName } from "./services.types";

interface ServiceResolver {
	findService(name: string): Promise<{ ip: IPAddress; port: Port } | null>;
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
export function setupAuditLogging(
	loggerInstance: typeof logger,
	addressManager: ServiceResolver,
	tlsPaths: TlsPaths,
): void {
	let connected = false;
	loggerInstance.setAuditResolver(async () => {
		try {
			const target = await addressManager.findService(
				ServiceInstanceName.AuditLoggerService,
			);
			if (!target) {
				return null;
			}
			_logFirstConnection(loggerInstance, target, connected);
			connected = true;
			return { url: `https://${target.ip}:${target.port}`, tls: tlsPaths };
		} catch {
			return null;
		}
	});
}

function _logFirstConnection(
	loggerInstance: typeof logger,
	target: { ip: IPAddress; port: Port },
	alreadyConnected: boolean,
): void {
	if (!alreadyConnected) {
		loggerInstance.info("audit-logger: connected", {
			url: `${target.ip}:${target.port}`,
		});
	}
}

export type { ServiceResolver };
