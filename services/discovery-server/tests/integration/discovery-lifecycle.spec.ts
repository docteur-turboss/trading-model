import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import http from 'http';
import express from 'express';
import { ServiceRegistry } from '../../src/core/service-registry';
import { registryRoutes } from '../../src/routes/register.routes';
import { heartbeatRoutes } from '../../src/routes/heartbeat.routes';

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/config/env', () => ({
  env: { CLEANUP_SERVICE_INTERVAL_MS: 5000, ERROR_URL_WEBHOOK: 'https://hooks.example.com/error' },
}));

describe('Discovery Lifecycle — Full HTTP Integration', () => {
  let registry: ServiceRegistry;
  let server: http.Server;

  function postJson(
    path: string,
    body: unknown,
    token?: string
  ): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Server not listening'));
        return;
      }
      const data = JSON.stringify(body);
      const options: http.RequestOptions = {
        hostname: 'localhost',
        port: addr.port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...(token ? { 'x-instance-token': token } : {}),
        },
      };
      const req = http.request(options, res => {
        let responseData = '';
        res.on('data', (chunk: string) => {
          responseData += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 500, body: JSON.parse(responseData) });
          } catch {
            resolve({ status: res.statusCode ?? 500, body: responseData });
          }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  function getJson(path: string): Promise<{ status: number; body: unknown }> {
    return new Promise((resolve, reject) => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Server not listening'));
        return;
      }
      const req = http.get(`http://localhost:${addr.port}${path}`, res => {
        let responseData = '';
        res.on('data', (chunk: string) => {
          responseData += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 500, body: JSON.parse(responseData) });
          } catch {
            resolve({ status: res.statusCode ?? 500, body: responseData });
          }
        });
        res.on('error', reject);
      });
      req.on('error', reject);
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ServiceRegistry();
    const app = express();
    app.use(express.json());
    app.use('/', registryRoutes(registry));
    app.use('/', heartbeatRoutes(registry));
    return new Promise<void>(resolve => {
      server = app.listen(0, () => {
        resolve();
      });
    });
  });

  afterEach(() => {
    return new Promise<void>(resolve => {
      if (server?.listening) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  it('should register an instance via POST /register', async () => {
    const result = await postJson('/register', {
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
    });
    expect(result.status).toBe(201);
    expect(result.body).toHaveProperty('instanceId', 'node-1');
    expect(result.body).toHaveProperty('token');
  });

  it('should reject registration with missing required fields', async () => {
    const result = await postJson('/register', { serviceName: 'financial-scraper-service' });
    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty('error', 'Invalid request body');
  });

  it('should reject registration with invalid IP', async () => {
    const result = await postJson('/register', {
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: 'not-an-ip',
      port: 8444,
    });
    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty('error', 'Invalid request body');
  });

  it('should reject registration with invalid service name', async () => {
    const result = await postJson('/register', {
      serviceName: 'unknown-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
    });
    expect(result.status).toBe(400);
    expect(result.body).toHaveProperty('error', 'Invalid service name');
  });

  it('should list registered services via GET /services', async () => {
    await postJson('/register', {
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
    });
    await postJson('/register', {
      serviceName: 'message-delivery-service',
      instanceId: 'msg-1',
      ip: '10.0.0.2',
      port: 8445,
    });
    const result = await getJson('/services');
    expect(result.status).toBe(200);
    expect(result.body).toContain('financial-scraper-service');
    expect(result.body).toContain('message-delivery-service');
  });

  it('should handle full lifecycle: register → heartbeat → token rotate → get instance', async () => {
    const registerResult = await postJson('/register', {
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
    });
    expect(registerResult.status).toBe(201);
    const token = (registerResult.body as Record<string, unknown>).token as string;
    expect(token).toBeDefined();

    const heartbeatResult = await postJson(
      '/heartbeat',
      { serviceName: 'financial-scraper-service', instanceId: 'node-1' },
      token
    );
    expect(heartbeatResult.status).toBe(200);
    expect(heartbeatResult.body).toHaveProperty('ttl', 30_000);

    const rotateResult = await postJson('/token/rotate', { instanceId: 'node-1' }, token);
    expect(rotateResult.status).toBe(200);
    expect(rotateResult.body).toHaveProperty('token');
    const newToken = (rotateResult.body as Record<string, unknown>).token as string;
    expect(newToken).not.toBe(token);

    const instanceResult = await getJson('/services/financial-scraper-service/node-1');
    expect(instanceResult.status).toBe(200);
    expect(instanceResult.body).toHaveProperty('instanceId', 'node-1');
  });

  it('should reject heartbeat with invalid token', async () => {
    await postJson('/register', {
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
    });
    const result = await postJson(
      '/heartbeat',
      { serviceName: 'financial-scraper-service', instanceId: 'node-1' },
      'invalid-token'
    );
    expect(result.status).toBe(401);
  });

  it('should get all instances for a service via GET /services/:name', async () => {
    const instances = [
      {
        serviceName: 'financial-scraper-service',
        instanceId: 'node-1',
        ip: '10.0.0.1',
        port: 8444,
      },
      {
        serviceName: 'financial-scraper-service',
        instanceId: 'node-2',
        ip: '10.0.0.2',
        port: 8444,
      },
    ];
    for (const inst of instances) {
      await postJson('/register', inst);
    }

    const result = await getJson('/services/financial-scraper-service');
    expect(result.status).toBe(200);
    expect(Array.isArray(result.body)).toBe(true);
    expect((result.body as unknown[]).length).toBe(2);
  });

  it('should return 404 for unknown service on GET /services/:name', async () => {
    const result = await getJson('/services/unknown-service');
    expect(result.status).toBe(404);
  });

  it('should return 404 for unknown instance on GET /services/:name/:id', async () => {
    const result = await getJson('/services/financial-scraper-service/non-existent');
    expect(result.status).toBe(404);
  });
});
