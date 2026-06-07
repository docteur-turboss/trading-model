import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createReq, createRes } from '../../helpers/express';

jest.mock('@trading-model/common/middleware/catch-error', () => ({
  catchSync: (fn: any) => fn,
}));

jest.mock('@trading-model/common/middleware/response-exception', () => ({
  sendResponse: (data: any, status: number) => ({ status, data }),
  ResponseException: jest.fn((body: any) => ({
    BadRequest: () => ({ type: 'BadRequest' as const, error: body }),
    Unauthorized: () => ({ type: 'Unauthorized' as const, error: body }),
    NotFound: () => ({ type: 'NotFound' as const, error: body }),
    Success: () => ({ type: 'Success' as const, ...body }),
  })),
}));

import { ServiceRegistry } from '../../../src/core/service-registry';
import { createHeartbeatController } from '../../../src/controllers/heartbeat.controller';

describe('Heartbeat.controller', () => {
  let registry: ServiceRegistry;
  let controller: ReturnType<typeof createHeartbeatController>;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ServiceRegistry();
    controller = createHeartbeatController(registry);
  });

  describe('heartbeat', () => {
    it('should reject non-object body with BadRequest', async () => {
      const req = createReq({ body: 'invalid' });
      await expect(controller.heartbeat(req, createRes(), jest.fn())).resolves.toMatchObject({
        status: 400,
        data: { error: 'Invalid request body' },
      });
    });

    it('should reject missing serviceName with BadRequest', async () => {
      const req = createReq({ body: { instanceId: 'i1' } });
      await expect(controller.heartbeat(req, createRes(), jest.fn())).resolves.toMatchObject({
        status: 400,
        data: { error: 'Invalid request body' },
      });
    });

    it('should reject missing instanceId with BadRequest', async () => {
      const req = createReq({ body: { serviceName: 'svc' } });
      await expect(controller.heartbeat(req, createRes(), jest.fn())).resolves.toMatchObject({
        status: 400,
        data: { error: 'Invalid request body' },
      });
    });

    it('should reject missing token header with Unauthorized', async () => {
      const req = createReq({ body: { serviceName: 'svc', instanceId: 'i1' } });
      await expect(controller.heartbeat(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'Unauthorized',
        error: 'Missing or invalid instance token',
      });
    });

    it('should reject invalid token with Unauthorized', async () => {
      const req = createReq({
        body: { serviceName: 'svc', instanceId: 'i1' },
        headers: { 'x-instance-token': 'bad' },
      });
      await expect(controller.heartbeat(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'Unauthorized',
        error: 'Invalid instance token',
      });
    });

    it('should return TTL on successful heartbeat', async () => {
      const registered = registry.registerInstance({
        serviceName: 'financial-scraper-service',
        instanceId: 'i1',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      });
      const req = createReq({
        body: { serviceName: 'financial-scraper-service', instanceId: 'i1' },
        headers: { 'x-instance-token': registered.token },
      });
      await expect(controller.heartbeat(req, createRes(), jest.fn())).resolves.toMatchObject({
        status: 200,
        data: { ttl: 30000 },
      });
    });

    it('should return NotFound when service does not match registered instance', async () => {
      const registered = registry.registerInstance({
        serviceName: 'financial-scraper-service',
        instanceId: 'i1',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      });
      const req = createReq({
        body: { serviceName: 'other-service', instanceId: 'i1' },
        headers: { 'x-instance-token': registered.token },
      });
      await expect(controller.heartbeat(req, createRes(), jest.fn())).resolves.toMatchObject({
        status: 404,
        data: { error: 'Instance not found' },
      });
    });
  });

  describe('rotateToken', () => {
    it('should reject non-object body with BadRequest', async () => {
      const req = createReq({ body: null });
      await expect(controller.rotateToken(req, createRes(), jest.fn())).resolves.toMatchObject({
        status: 400,
        data: { error: 'Invalid request body' },
      });
    });

    it('should reject missing instanceId with BadRequest', async () => {
      const req = createReq({ body: {} });
      await expect(controller.rotateToken(req, createRes(), jest.fn())).resolves.toMatchObject({
        status: 400,
        data: { error: 'Invalid request body' },
      });
    });

    it('should reject missing token header with Unauthorized', async () => {
      const req = createReq({ body: { instanceId: 'i1' } });
      await expect(controller.rotateToken(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'Unauthorized',
        error: 'Missing or invalid instance token',
      });
    });

    it('should reject invalid token with Unauthorized', async () => {
      const req = createReq({
        body: { instanceId: 'i1' },
        headers: { 'x-instance-token': 'bad' },
      });
      await expect(controller.rotateToken(req, createRes(), jest.fn())).rejects.toMatchObject({
        type: 'Unauthorized',
        error: 'Invalid instance token',
      });
    });

    it('should return new token on successful rotation', async () => {
      const registered = registry.registerInstance({
        serviceName: 'financial-scraper-service',
        instanceId: 'i1',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      });
      const req = createReq({
        body: { instanceId: 'i1' },
        headers: { 'x-instance-token': registered.token },
      });
      await expect(controller.rotateToken(req, createRes(), jest.fn())).resolves.toMatchObject({
        status: 200,
        data: { token: expect.any(String) },
      });
    });
  });
});
