import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';

import { Application } from 'express';

import { TlsConfig } from './load-tls-config';
import { logger } from '../config/logger';

/** Options for creating the HTTPS server. */
export interface HttpsServerOptions {
  port: number;
  tls: TlsConfig;
}

/** Minimal abstraction over a running HTTP server. */
export interface HttpServer {
  close: () => Promise<void>;
}

/**
 * Create an HTTPS server with mTLS (TLSv1.3, requestCert, rejectUnauthorized),
 * start listening on the given port, and return an HttpServer handle.
 *
 * @param app - The configured Express Application to serve.
 * @param options - Port and TLS certificate paths.
 * @returns An HttpServer with a close method that drains connections.
 */
export async function createAndStartHttpsServer(
  app: Application,
  options: HttpsServerOptions
): Promise<HttpServer> {
  const [key, cert, ca] = await Promise.all([
    fs.readFile(path.resolve(options.tls.key), 'utf8'),
    fs.readFile(path.resolve(options.tls.cert), 'utf8'),
    fs.readFile(path.resolve(options.tls.ca), 'utf8'),
  ]);

  const httpsServer = https.createServer(
    {
      key,
      cert,
      ca,
      requestCert: true,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.3',
    },
    app
  );

  httpsServer.listen(options.port, () => {
    logger.info('HTTPS server listening', {
      port: options.port,
      mtls: true,
    });
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpsServer.close(err => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}
