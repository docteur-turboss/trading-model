import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockIsInitialized = jest.fn();
const mockGetCaCertPem = jest.fn();

jest.mock('../../src/app/index', () => ({
  ca: {
    isInitialized: mockIsInitialized,
    getCaCertPem: mockGetCaCertPem,
  },
}));

import { ping, health } from '../../src/controllers/health.controller';

describe('health.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ping', () => {
    it('should return ok status', async () => {
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      const req = {} as any;
      const res = { status } as any;

      await ping(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.status().json).toHaveBeenCalledWith({ status: 'ok' });
    });
  });

  describe('health', () => {
    it('should return 200 when CA is initialized', async () => {
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      const req = {} as any;
      const res = { status } as any;

      mockIsInitialized.mockReturnValue(true);
      mockGetCaCertPem.mockReturnValue('-----BEGIN CERTIFICATE-----\nca-cert\n-----END CERTIFICATE-----');

      await health(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.status().json).toHaveBeenCalledWith({
        status: 'ok',
        caInitialized: true,
        caFingerprint: expect.any(String),
      });
    });

    it('should return 503 when CA is not initialized', async () => {
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      const req = {} as any;
      const res = { status } as any;

      mockIsInitialized.mockReturnValue(false);

      await health(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.status().json).toHaveBeenCalledWith({
        status: 'unavailable',
        caInitialized: false,
      });
    });

    it('should return null caFingerprint when no CA cert PEM', async () => {
      const json = jest.fn();
      const status = jest.fn(() => ({ json }));
      const req = {} as any;
      const res = { status } as any;

      mockIsInitialized.mockReturnValue(true);
      mockGetCaCertPem.mockReturnValue('');

      await health(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.status().json).toHaveBeenCalledWith({
        status: 'ok',
        caInitialized: true,
        caFingerprint: null,
      });
    });
  });
});
