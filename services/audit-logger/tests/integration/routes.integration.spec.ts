import { describe, it, expect, afterEach, jest } from '@jest/globals';
import http from 'http';
import express from 'express';

jest.mock('../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 0,
    TLS_KEY_PATH: '',
    TLS_CERT_PATH: '',
    TLS_CA_PATH: '',
    LOG_LEVEL: 'info',
    MONGODB_URI: 'mongodb://localhost:27017/test',
    APP_NAME: 'audit-logger',
    APP_VERSION: '1.0.0',
    SERVICE_NAME: 'audit-logger-service',
    INSTANCE_ID: 'test-instance',
    CACHE_TTL_MS: 30000,
    SERVICE_PING_TIMEOUT_MS: 2000,
    TOKEN_REFRESH_INTERVAL_MS: 60000,
    TTL_REFRESH_INTERVAL_MS: 15000,
    ADDRESS_MANAGER_URL: 'http://localhost:3000',
    ERROR_URL_WEBHOOK: '',
    MESSAGE_BUS_INIT_TIMEOUT_MS: 5000,
    MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS: 5000,
    MESSAGE_CALLBACK_PATH: 'message',
  },
}));

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/config/address-manager', () => ({
  AddressManagerRoutes: (): void => {},
  bootstrapAddressManager: (): { stop: () => void } => ({ stop: (): void => {} }),
  AddressManager: { getAddress: (): null => null },
}));

import { InternalQueue } from '../../src/scheduler/internal-queue';
import { BackPressure } from '../../src/scheduler/back-pressure';
import { WorkerRegistry } from '../../src/worker/worker-registry';
import { healthRoutes } from '../../src/routes/health.routes';

function createApp(): express.Application {
  const app = express();
  const queue = new InternalQueue(30000);
  const backPressure = new BackPressure(1000, 0.8);
  const workers = new WorkerRegistry(30000);
  app.use('/', healthRoutes(queue, backPressure, workers));
  return app;
}

function fetchJson(server: http.Server, path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      reject(new Error('Server not listening'));
      return;
    }
    const req = http.get(`http://localhost:${addr.port}${path}`, res => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 500, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode ?? 500, body: data });
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

describe('Audit Logger — Routes Integration', () => {
  let server: http.Server;

  afterEach(() => {
    jest.restoreAllMocks();
    return new Promise<void>(resolve => {
      if (server?.listening) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  it('GET /ping should return 200', async () => {
    const app = createApp();
    await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
    const result = await fetchJson(server, '/ping');
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty('status', 'ok');
  });

  it('GET /health should return health information', async () => {
    const app = createApp();
    await new Promise<void>(resolve => { server = app.listen(0, () => resolve()); });
    const result = await fetchJson(server, '/health');
    expect(result.status).toBe(200);
    expect(result.body).toHaveProperty('status', 'ok');
    expect(result.body).toHaveProperty('queueDepth');
    expect(result.body).toHaveProperty('canAccept');
  });
});
