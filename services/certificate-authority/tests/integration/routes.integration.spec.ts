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
    CA_KEY_PATH: '/tmp/ca-key.pem',
    CA_CERT_TTL_MS: 31536000000,
    CERT_ROTATION_INTERVAL_MS: 86400000,
    CERT_ROTATION_MARGIN_MS: 17280000,
    CERT_DEFAULT_TTL_MS: 604800000,
    DISCOVERY_SERVICE_URL: 'http://localhost:3000',
  },
}));

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { healthRoutes } from '../../src/routes/health.routes';

function createApp(): express.Application {
  const app = express();
  app.use('/', healthRoutes());
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

describe('Certificate Authority — Routes Integration', () => {
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
});
