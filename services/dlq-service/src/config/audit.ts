import { HttpClient } from '@trading-model/common/config/http-client';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';

import { findAService } from './address-manager';
import { env } from './env';
import { logger } from './logger';

export interface AuditEvent {
  timestamp: string;
  topic: string;
  publisher: string;
  correlationId: string;
  summary: string;
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
}

let httpClient: HttpClient | null = null;
let httpClientPromise: Promise<HttpClient> | null = null;

async function getAuditHttpClient(): Promise<HttpClient> {
  if (httpClient) return httpClient;
  if (httpClientPromise) return httpClientPromise;

  httpClientPromise = (async () => {
    const client = new HttpClient({
      ca: env.TLS_CA_PATH,
      cert: env.TLS_CERT_PATH,
      key: env.TLS_KEY_PATH,
    });
    httpClient = client;
    return client;
  })();

  return httpClientPromise;
}

let auditLoggerUrl: string | null | undefined;
let auditUrlPromise: Promise<string | null> | null = null;

async function resolveAuditLoggerUrl(): Promise<string | null> {
  if (auditLoggerUrl !== undefined) return auditLoggerUrl;
  if (auditUrlPromise) return auditUrlPromise;

  auditUrlPromise = (async () => {
    try {
      const target = await findAService(ServiceInstanceName.AuditLoggerService);
      if (target) {
        auditLoggerUrl = `https://${target.ip}:${target.port}`;
        return auditLoggerUrl;
      }
    } catch {
      logger.warn('Cannot resolve audit-logger URL via address-manager');
    }
    auditLoggerUrl = null;
    return null;
  })();

  return auditUrlPromise;
}

let auditCircuitFailures = 0;
let auditCircuitOpenUntil = 0;
const AUDIT_CIRCUIT_THRESHOLD = 10;
const AUDIT_CIRCUIT_RESET_MS = 60_000;

export async function notifyAudit(event: AuditEvent): Promise<void> {
  if (auditCircuitOpenUntil > Date.now()) return;

  try {
    const url = await resolveAuditLoggerUrl();
    if (!url) return;

    const client = await getAuditHttpClient();
    await client.post(`${url}/audit`, event, {
      timeoutMs: 5000,
      serviceName: ServiceInstanceName.AuditLoggerService,
      retryCount: 2,
    });
    if (auditCircuitFailures > 0) auditCircuitFailures = 0;
    auditCircuitOpenUntil = 0;
  } catch (err) {
    auditCircuitFailures++;
    if (auditCircuitFailures >= AUDIT_CIRCUIT_THRESHOLD) {
      auditCircuitOpenUntil = Date.now() + AUDIT_CIRCUIT_RESET_MS;
      logger.warn('Audit-logger circuit breaker opened — suppressing notifications', {
        failures: auditCircuitFailures,
        resetMs: AUDIT_CIRCUIT_RESET_MS,
      });
    } else {
      logger.warn('Audit notification failed (non-fatal)', {
        error: (err as Error)?.message,
        topic: event.topic,
      });
    }
  }
}
