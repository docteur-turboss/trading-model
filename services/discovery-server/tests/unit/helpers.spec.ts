import { describe, it, expect, beforeEach } from '@jest/globals';

jest.mock('@trading-model/common/middleware/response-exception', () => ({
  ResponseException: jest.fn((body: any) => ({
    Unauthorized: () => ({ type: 'Unauthorized' as const, error: body }),
  })),
}));

jest.mock('@trading-model/common/validation/primitives', () => ({
  isNonEmptyString: (v: any) => typeof v === 'string' && v.trim().length > 0,
}));

import { ServiceRegistry } from '../../src/core/service-registry';
import { validateInstanceToken } from '../../src/controllers/helpers';
import { ResponseException } from '@trading-model/common/middleware/response-exception';

describe('helpers', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ServiceRegistry();
  });

  describe('validateInstanceToken', () => {
    it('should throw Unauthorized if token header is missing', () => {
      expect(() => validateInstanceToken(registry, null, 'instance-1')).toThrow();
      expect(ResponseException).toHaveBeenCalledWith('Missing or invalid instance token');
    });

    it('should throw Unauthorized if token header is empty string', () => {
      expect(() => validateInstanceToken(registry, '', 'instance-1')).toThrow();
    });

    it('should throw Unauthorized if token is invalid', () => {
      expect(() => validateInstanceToken(registry, 'invalid-token', 'instance-1')).toThrow();
    });

    it('should not throw if token is valid', () => {
      const registered = registry.registerInstance({
        serviceName: 'financial-scrapper-service',
        instanceId: 'instance-1',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      });

      expect(() => validateInstanceToken(registry, registered.token, 'instance-1')).not.toThrow();
    });
  });
});
