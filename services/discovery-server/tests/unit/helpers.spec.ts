import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../src/core/service-registry', () => ({
  registry: {
    validInstanceToken: jest.fn<(token: string, instanceId: string) => boolean>(),
  },
}));

jest.mock('@trading-model/common/middleware/response-exception', () => ({
  ResponseException: jest.fn((body: any) => ({
    Unauthorized: () => ({ type: 'Unauthorized' as const, error: body }),
  })),
}));

jest.mock('@trading-model/common/validation/primitives', () => ({
  isNonEmptyString: (v: any) => typeof v === 'string' && v.trim().length > 0,
}));

import { validateInstanceToken, asHandler } from '../../src/controllers/helpers';
import { registry } from '../../src/core/service-registry';
import { ResponseException } from '@trading-model/common/middleware/response-exception';

describe('helpers', () => {
  describe('asHandler', () => {
    it('should return the same function', () => {
      const fn = () => 'test';
      const handler = asHandler(fn);
      expect(handler).toBe(fn);
    });
  });

  describe('validateInstanceToken', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should throw Unauthorized if token header is missing', () => {
      expect(() => validateInstanceToken(null, 'instance-1')).toThrow();
      expect(ResponseException).toHaveBeenCalledWith('Missing or invalid instance token');
    });

    it('should throw Unauthorized if token header is empty string', () => {
      expect(() => validateInstanceToken('', 'instance-1')).toThrow();
    });

    it('should throw Unauthorized if token is invalid', () => {
      (registry.validInstanceToken as jest.Mock).mockReturnValue(false);
      expect(() => validateInstanceToken('invalid-token', 'instance-1')).toThrow();
      expect(registry.validInstanceToken).toHaveBeenCalledWith('invalid-token', 'instance-1');
    });

    it('should not throw if token is valid', () => {
      (registry.validInstanceToken as jest.Mock).mockReturnValue(true);
      expect(() => validateInstanceToken('valid-token', 'instance-1')).not.toThrow();
    });
  });
});
