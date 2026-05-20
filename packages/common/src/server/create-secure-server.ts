import { ResponseProtocole } from '../middleware/response-protocole';
import { MTLSAuthMiddleware } from '../middleware/mtls-auth';
import { logger } from '../config/logger';
import { rateLimit } from 'express-rate-limit';
import express, { Application } from 'express';
import https from 'node:https';
import path from 'node:path';
import helmet from 'helmet';
import fs from 'node:fs';

export interface TlsPaths {
  key: string;
  cert: string;
  ca: string;
}

export interface RateLimitConfig {
  windowMs: number;
  limit: number;
  message?: string;
}

export interface SecureServerOptions {
  port: number;
  tls: TlsPaths;
  routes: (app: Application) => void;
  rateLimit?: RateLimitConfig;
  trustProxy?: boolean;
}

export interface HttpServer {
  close: () => Promise<void>;
}

export function createSecureServer(options: SecureServerOptions): HttpServer {
  const app = express();

  app.use(helmet());

  if (options.trustProxy !== false) {
    app.set('trust proxy', true);
  }

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));

  const limiter = rateLimit({
    windowMs: options.rateLimit?.windowMs ?? 15 * 60 * 1000,
    limit: options.rateLimit?.limit ?? 100,
    message:
      options.rateLimit?.message ?? 'Too many requests from this IP, please try again later.',
  });

  app.use(limiter);

  app.use(MTLSAuthMiddleware);

  options.routes(app);

  app.use(ResponseProtocole);

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
        try {
          httpsServer.close();
          resolve();
        } catch (e) {
          reject(e);
        }
      }),
  };
}
