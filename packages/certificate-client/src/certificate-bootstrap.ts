import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

import type { Application } from 'express';

import { generateKeyPairAsync, createCsrAsync } from '@trading-model/certificate-utils/async';
import { KeyAlgorithm } from '@trading-model/certificate-utils/generate-key-pair';
import { CaClient } from '@trading-model/common/ca/ca-client';
import { logger } from '@trading-model/common/config/logger';
import type { TlsBootstrapOptions } from '@trading-model/common/server/bootstrap';
import type { TlsConfig } from '@trading-model/common/server/load-tls-config';
import type { HttpServer } from '@trading-model/common/server/server-factory';
import { normalizeError } from '@trading-model/common/utils/errors';

import { CertificateClient } from './certificate-client';

export interface BootstrapConfig {
  caUrl: string;
  serviceId: string;
  commonName: string;
  san: string[];
  certPath: string;
  keyPath: string;
  caPath: string;
  bootstrapToken?: string;
  tls?: {
    ca: string;
    cert: string;
    key: string;
  };
}

export function bootstrapConfigFromEnv(
  env: Record<string, string | undefined>
): BootstrapConfig | null {
  const caUrl = env.CERT_CLIENT_CA_URL;
  if (!caUrl) return null;

  const serviceId = env.CERT_CLIENT_SERVICE_ID ?? env.APP_NAME ?? 'unknown';
  const commonName = env.CERT_CLIENT_COMMON_NAME ?? serviceId;
  const sanRaw = env.CERT_CLIENT_SANS ?? serviceId;

  return {
    caUrl,
    serviceId,
    commonName,
    san: sanRaw.split(',').map(s => s.trim()),
    certPath: env.TLS_CERT_PATH ?? '/etc/tls/cert.pem',
    keyPath: env.TLS_KEY_PATH ?? '/etc/tls/key.pem',
    caPath: env.TLS_CA_PATH ?? '/etc/tls/ca.pem',
    bootstrapToken: env.CERT_CLIENT_BOOTSTRAP_TOKEN,
    tls: env.CA_CLIENT_TLS_KEY
      ? {
          key: env.CA_CLIENT_TLS_KEY,
          cert: env.CA_CLIENT_TLS_CERT ?? '',
          ca: env.CA_CLIENT_TLS_CA ?? '',
        }
      : undefined,
  };
}

export async function bootstrapFromEnv(
  env: Record<string, string | undefined>
): Promise<TlsConfig | null> {
  const config = bootstrapConfigFromEnv(env);
  if (!config) return null;
  return await bootstrapCertificate(config);
}

export async function bootstrapCertificate(config: BootstrapConfig): Promise<TlsConfig> {
  try {
    await fs.access(config.certPath);
    await fs.access(config.keyPath);
    logger.info('TLS certificate already exists — skipping bootstrap', {
      certPath: config.certPath,
    });
    return { key: config.keyPath, cert: config.certPath, ca: config.caPath };
  } catch (err) {
    logger.warn('TLS certificate files not found — proceeding with bootstrap', {
      err: normalizeError(err),
    });
  }

  logger.info('Obtaining TLS certificate from CA', {
    serviceId: config.serviceId,
    caUrl: config.caUrl,
  });

  const keyPair = await generateKeyPairAsync(KeyAlgorithm.EC_P384);
  const csr = await createCsrAsync({
    commonName: config.commonName,
    san: config.san,
    keyPem: keyPair.privateKey,
  });

  const caClient = new CaClient({
    baseUrl: config.caUrl,
    tls: config.tls,
  });

  const response = await caClient.signCertificate(config.serviceId, csr, {
    bootstrapToken: config.bootstrapToken,
  });

  const certDir = path.dirname(config.certPath);
  await fs.mkdir(certDir, { recursive: true });

  await fs.writeFile(config.keyPath, keyPair.privateKey, { mode: 0o600 });
  await fs.writeFile(config.certPath, response.cert, { mode: 0o644 });
  await fs.writeFile(config.caPath, response.caPem, { mode: 0o644 });

  logger.info('TLS certificate obtained and written to disk', {
    serviceId: config.serviceId,
    certPath: config.certPath,
    serialNumber: response.serialNumber,
    expiresAt: response.expiresAt,
  });

  return { key: config.keyPath, cert: config.certPath, ca: config.caPath };
}

export interface CreateHttpsServerOptions {
  port: number;
  tls: TlsConfig;
  routes: (app: Application) => void;
  rateLimit?: import('@trading-model/common/server/configure-app').RateLimitConfig;
  trustProxy?: boolean;
  watchTls?: boolean;
  env?: Record<string, string | undefined>;
  onServerReady?: (raw: import('node:https').Server) => void;
}

/**
 * Builds a {@link TlsBootstrapOptions} for use with {@link createBootstrap}.
 *
 * - `ensure()`: bootsraps TLS certificates from the CA if they do not
 *   already exist on disk (idempotent: skips if cert/key are present).
 * - `setupAutoRenew(server)`: creates a {@link CertificateClient} that
 *   periodically renews the certificate before expiry and hot-reloads
 *   the server TLS context via `server.setSecureContext()`.
 *
 * Returns `null` when `CERT_CLIENT_CA_URL` is not set (static TLS).
 */
export function createTlsBootstrap(
  env: Record<string, string | undefined>
): TlsBootstrapOptions | null {
  const config = bootstrapConfigFromEnv(env);
  if (!config) return null;

  return {
    ensure: async () => {
      await bootstrapCertificate(config);
    },
    setupAutoRenew: (server: https.Server) => {
      const client = new CertificateClient({
        ...config,
        onRenew: cert => {
          try {
            server.setSecureContext({ key: cert.keyPem, cert: cert.certPem, ca: cert.caPem });
            logger.info('TLS context hot-reloaded after certificate renewal');
          } catch (err) {
            logger.error('Failed to hot-reload TLS context', { err });
          }
        },
      });
      setTimeout(() => client.startAutoRenew(), 1000);
    },
  };
}

export async function createHttpsServer(options: CreateHttpsServerOptions): Promise<HttpServer> {
  const env = options.env ?? {};
  const bootstrapTls = await bootstrapFromEnv(env);
  const tls = bootstrapTls ?? options.tls;

  const { configureApp } = await import('@trading-model/common/server/configure-app');
  const { MTLSAuthMiddleware } = await import('@trading-model/common/middleware/mtls-auth');
  const { ResponseProtocol } = await import('@trading-model/common/middleware/response-protocol');
  const { createAndStartHttpsServer } = await import('@trading-model/common/server/server-factory');

  const app = configureApp({
    rateLimit: options.rateLimit,
    trustProxy: options.trustProxy,
  });

  app.use(MTLSAuthMiddleware);
  options.routes(app);
  app.use(ResponseProtocol);

  const server = await createAndStartHttpsServer(app, {
    port: options.port,
    tls,
    watchTls: options.watchTls ?? true,
  });

  options.onServerReady?.(server.raw);

  const config = bootstrapConfigFromEnv(env);
  if (config) {
    const client = new CertificateClient({
      ...config,
      onRenew: cert => {
        server.raw.setSecureContext({ key: cert.keyPem, cert: cert.certPem, ca: cert.caPem });
      },
    });
    setTimeout(() => client.startAutoRenew(), 1000);
  }

  return server;
}
