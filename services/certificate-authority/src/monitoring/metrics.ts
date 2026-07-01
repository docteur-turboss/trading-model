import { RequestHandler } from 'express';
import client from 'prom-client';

import { logger } from '@trading-model/common/config/logger';

const register = new client.Registry();

client.collectDefaultMetrics({ register });

const certificatesSignedTotal = new client.Counter({
  name: 'ca_certificates_signed_total',
  help: 'Total certificates signed by the CA',
  labelNames: ['method'],
  registers: [register],
});

const certificateSignDurationSeconds = new client.Histogram({
  name: 'ca_certificate_sign_duration_seconds',
  help: 'Duration of certificate signing operations',
  labelNames: ['method'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

const revokedCertificatesTotal = new client.Counter({
  name: 'ca_revoked_certificates_total',
  help: 'Total certificates revoked',
  registers: [register],
});

const renewalFailuresTotal = new client.Counter({
  name: 'ca_renewal_failures_total',
  help: 'Total certificate renewal failures (exhausted retries)',
  labelNames: ['serviceId'],
  registers: [register],
});

const authenticationFailuresTotal = new client.Counter({
  name: 'ca_authentication_failures_total',
  help: 'Total authentication failures (invalid tokens, OIDC, mTLS)',
  labelNames: ['reason'],
  registers: [register],
});

const workerPoolSize = new client.Gauge({
  name: 'ca_worker_pool_size',
  help: 'Current number of workers in the crypto worker pool',
  registers: [register],
});

const workerPoolPending = new client.Gauge({
  name: 'ca_worker_pool_pending',
  help: 'Number of pending tasks in the crypto worker pool',
  registers: [register],
});

export function incSigned(method: string = 'sign'): void {
  certificatesSignedTotal.inc({ method });
}

export function observeSignDuration(method: string, durationMs: number): void {
  certificateSignDurationSeconds.observe({ method }, durationMs / 1000);
}

export function incRevoked(): void {
  revokedCertificatesTotal.inc();
}

export function incRenewalFailure(serviceId: string): void {
  renewalFailuresTotal.inc({ serviceId });
}

export function incAuthFailure(reason: string): void {
  authenticationFailuresTotal.inc({ reason });
}

export function setWorkerPoolSize(size: number): void {
  workerPoolSize.set(size);
}

export function setWorkerPoolPending(pending: number): void {
  workerPoolPending.set(pending);
}

export function sendAlertWebhook(
  webhookUrl: string | undefined,
  title: string,
  message: string,
  severity: 'info' | 'warning' | 'error' = 'error',
  labels?: Record<string, string>,
): void {
  if (!webhookUrl) return;

  const body = JSON.stringify({
    title,
    message,
    severity,
    labels,
    timestamp: new Date().toISOString(),
    source: 'certificate-authority',
  });

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(10_000),
  }).then(res => {
    if (!res.ok) {
      logger.warn('Alert webhook returned non-OK status', { status: res.status, webhookUrl });
    }
  }).catch(err => {
    logger.warn('Alert webhook delivery failed', { err: (err as Error).message, webhookUrl });
  });
}

export const metricsHandler: RequestHandler = async (_req, res) => {
  res.setHeader('Content-Type', register.contentType);
  res.end(await register.metrics());
};

export { register };
