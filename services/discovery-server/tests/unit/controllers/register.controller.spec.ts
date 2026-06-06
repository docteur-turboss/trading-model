import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createReq, createRes, createNext } from '../../helpers/express';
import { validRegisterPayload } from '../../fixtures/index';

jest.mock('@trading-model/common/middleware/catch-error', () => ({
  catchSync: (fn: any) => fn,
}));

jest.mock('@trading-model/common/middleware/response-exception', () => {
  const ResponseException = jest.fn((body: any) => ({
    BadRequest: () => ({ type: 'BadRequest' as const, error: body }),
    NotFound: () => ({ type: 'NotFound' as const, error: body }),
    OK: () => ({ type: 'OK' as const, ...body }),
    Success: () => ({ type: 'Success' as const, ...body }),
  }));
  return { ResponseException };
});

jest.mock('@trading-model/common/validation/primitives', () => ({
  isObject: (v: any) => v !== null && typeof v === 'object',
  isNonEmptyString: (v: any) => typeof v === 'string' && v.trim().length > 0,
  isValidIP: (v: any) => typeof v === 'string' && v.length > 0,
  isValidPort: (v: any) => typeof v === 'number' && v > 0,
}));

import { ServiceRegistry } from '../../../src/core/service-registry';
import { createRegisterController } from '../../../src/controllers/register.controller';

describe('Register.controller', () => {
  let registry: ServiceRegistry;
  let controller: ReturnType<typeof createRegisterController>;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ServiceRegistry();
    controller = createRegisterController(registry);
  });

  describe('register', () => {
    it('should reject null body with BadRequest', async () => {
      await expect(
        controller.register(createReq({ body: null }), createRes(), createNext)
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'Invalid request body' });
    });

    it('should reject missing serviceName with BadRequest', async () => {
      await expect(
        controller.register(
          createReq({ body: { ip: '1.1.1.1', port: 80 } }),
          createRes(),
          createNext
        )
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'serviceName is required' });
    });

    it('should reject invalid service name with BadRequest', async () => {
      const invalidPayload = { ...validRegisterPayload, serviceName: 'unknown-service' };
      await expect(
        controller.register(createReq({ body: invalidPayload }), createRes(), createNext)
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'Invalid service name' });
    });

    it('should reject invalid IP with BadRequest', async () => {
      await expect(
        controller.register(
          createReq({ body: { ...validRegisterPayload, ip: null } }),
          createRes(),
          createNext
        )
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'Invalid IP address' });
    });

    it('should reject invalid port with BadRequest', async () => {
      await expect(
        controller.register(
          createReq({ body: { ...validRegisterPayload, port: -1 } }),
          createRes(),
          createNext
        )
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'Invalid port' });
    });

    it('should register a new instance and return OK with generated instanceId', async () => {
      await expect(
        controller.register(createReq({ body: validRegisterPayload }), createRes(), createNext)
      ).rejects.toMatchObject({
        type: 'OK',
        serviceName: validRegisterPayload.serviceName,
      });
    });

    it('should pass provided instanceId to registry', async () => {
      const body = { ...validRegisterPayload, instanceId: 'custom-id' };
      await expect(
        controller.register(createReq({ body }), createRes(), createNext)
      ).rejects.toMatchObject({
        type: 'OK',
        instanceId: 'custom-id',
      });
    });

    it('should reject empty string instanceId with BadRequest', async () => {
      await expect(
        controller.register(
          createReq({ body: { ...validRegisterPayload, instanceId: '' } }),
          createRes(),
          createNext
        )
      ).rejects.toMatchObject({ type: 'BadRequest', error: 'Invalid instanceId' });
    });
  });

  describe('listServices', () => {
    it('should return list of service names', async () => {
      await expect(
        controller.listServices(createReq(), createRes(), createNext)
      ).rejects.toMatchObject({ type: 'Success' });
    });

    it('should return registered service names', async () => {
      registry.registerInstance({
        serviceName: 'financial-scrapper-service',
        instanceId: 'i1',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      });

      await expect(
        controller.listServices(createReq(), createRes(), createNext)
      ).rejects.toMatchObject({ type: 'Success' });
    });
  });

  describe('getServiceInstances', () => {
    it('should reject missing serviceName with BadRequest', async () => {
      await expect(
        controller.getServiceInstances(createReq({ params: {} }), createRes(), createNext)
      ).rejects.toMatchObject({ type: 'BadRequest' });
    });

    it('should reject unknown service name with NotFound', async () => {
      await expect(
        controller.getServiceInstances(
          createReq({ params: { serviceName: 'unknown-service' } }),
          createRes(),
          createNext
        )
      ).rejects.toMatchObject({ type: 'NotFound', error: 'Unknown service' });
    });

    it('should return instances for known service', async () => {
      registry.registerInstance({
        serviceName: 'financial-scrapper-service',
        instanceId: 'i1',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      });

      await expect(
        controller.getServiceInstances(
          createReq({ params: { serviceName: 'financial-scrapper-service' } }),
          createRes(),
          createNext
        )
      ).rejects.toMatchObject({ type: 'Success' });
    });
  });

  describe('getInstance', () => {
    it('should reject missing params with BadRequest', async () => {
      await expect(
        controller.getInstance(
          createReq({ params: { serviceName: 'svc' } }),
          createRes(),
          createNext
        )
      ).rejects.toMatchObject({ type: 'BadRequest' });
    });

    it('should reject unknown instance with NotFound', async () => {
      await expect(
        controller.getInstance(
          createReq({ params: { serviceName: 'svc', instanceId: 'i1' } }),
          createRes(),
          createNext
        )
      ).rejects.toMatchObject({ type: 'NotFound' });
    });

    it('should return instance when found', async () => {
      registry.registerInstance({
        serviceName: 'financial-scrapper-service',
        instanceId: 'i1',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      });

      await expect(
        controller.getInstance(
          createReq({
            params: { serviceName: 'financial-scrapper-service', instanceId: 'i1' },
          }),
          createRes(),
          createNext
        )
      ).rejects.toMatchObject({ type: 'Success' });
    });
  });
});
