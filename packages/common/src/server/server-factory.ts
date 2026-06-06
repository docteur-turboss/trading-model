import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

import { Application } from 'express';

import { logger } from '../config/logger';

/** Filesystem paths to TLS certificate files. */
export interface TlsPaths {
  key: string;
  cert: string;
  ca: string;
}

/** Options for creating the HTTPS server. */
export interface HttpsServerOptions {
  port: number;
  tls: TlsPaths;
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
export function createAndStartHttpsServer(
  app: Application,
  options: HttpsServerOptions
): HttpServer {
  const httpsServer = https.createServer(
    {
      key: fs.readFileSync(path.resolve(options.tls.key)),
      cert: fs.readFileSync(path.resolve(options.tls.cert)),
      ca: fs.readFileSync(path.resolve(options.tls.ca)),
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
