import { logger } from './logger';
import { ServiceInstanceName } from './services.types';

interface TlsClientPaths {
  key: string;
  cert: string;
  ca: string;
}

interface ServiceResolver {
  findService(name: string): Promise<{ ip: string; port: number } | null>;
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
export async function setupAuditLogging(
  loggerInstance: typeof logger,
  addressManager: ServiceResolver,
  tlsPaths: TlsClientPaths
): Promise<void> {
  let connected = false;

  loggerInstance.setAuditResolver(async () => {
    try {
      const target = await addressManager.findService(ServiceInstanceName.AuditLoggerService);
      if (!target) return null;

      if (!connected) {
        connected = true;
        loggerInstance.info('audit-logger: connected', { url: `${target.ip}:${target.port}` });
      }
      return {
        url: `https://${target.ip}:${target.port}`,
        tls: tlsPaths,
      };
    } catch {
      return null;
    }
  });
}

export type { TlsClientPaths, ServiceResolver };
