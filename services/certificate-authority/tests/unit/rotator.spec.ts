import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../src/config/env', () => ({
  env: {},
}));

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@trading-model/common/config/logger';
import { Rotator } from '../../src/core/rotator';

const mockCa = {
  isInitialized: jest.fn(),
  getCaCertPem: jest.fn(),
  signServiceCertificate: jest.fn(),
  revokeCertificate: jest.fn(),
  getCrl: jest.fn(),
  initialize: jest.fn(),
};

const mockCertificateStore = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  save: jest.fn(),
  getBySerial: jest.fn(),
  getByServiceId: jest.fn(),
  getExpiring: jest.fn(),
};

describe('Rotator', () => {
  let rotator: Rotator;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    rotator = new Rotator({
      ca: mockCa as any,
      certificateStore: mockCertificateStore as any,
      intervalMs: 86400000,
      marginMs: 17280000,
      defaultTtlMs: 604800000,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should set an interval timer', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      rotator.start();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 86400000);
    });

    it('should not start a second timer if already running', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      rotator.start();
      rotator.start();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    });

    it('should log starting message', () => {
      rotator.start();

      expect(logger.info).toHaveBeenCalledWith('Starting certificate rotator', {
        intervalMs: 86400000,
        marginMs: 17280000,
      });
    });
  });

  describe('stop', () => {
    it('should clear the interval timer', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      rotator.start();
      rotator.stop();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should log stopping message', () => {
      rotator.start();
      rotator.stop();

      expect(logger.info).toHaveBeenCalledWith('Certificate rotator stopped');
    });

    it('should not throw if stopping without starting', () => {
      expect(() => rotator.stop()).not.toThrow();
    });
  });

  describe('rotation logic', () => {
    it('should fetch expiring certificates on each interval', async () => {
      mockCertificateStore.getExpiring.mockResolvedValue([]);

      rotator.start();
      jest.advanceTimersByTime(86400000);
      await jest.advanceTimersByTimeAsync(0);

      expect(mockCertificateStore.getExpiring).toHaveBeenCalledWith(17280000);
    });

    it('should log when no expiring certificates found', async () => {
      mockCertificateStore.getExpiring.mockResolvedValue([]);

      rotator.start();
      jest.advanceTimersByTime(86400000);
      await jest.advanceTimersByTimeAsync(0);

      expect(logger.info).not.toHaveBeenCalledWith(
        'Rotating expiring certificates',
        expect.any(Object)
      );
    });

    it('should log when expiring certificates found', async () => {
      mockCertificateStore.getExpiring.mockResolvedValue([
        {
          serialNumber: 'SN-001',
          serviceId: 'svc-1',
          certPem: 'cert',
          caPem: 'ca',
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 10000),
          fingerprint: 'fp',
        },
      ]);

      rotator.start();
      jest.advanceTimersByTime(86400000);
      await jest.advanceTimersByTimeAsync(0);

      expect(logger.info).toHaveBeenCalledWith('Rotating expiring certificates', { count: 1 });
    });

    it('should log error when per-cert rotation logging fails', async () => {
      const err = new Error('log failure');
      (logger.info as jest.Mock)
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(undefined)
        .mockImplementationOnce(() => { throw err; });

      mockCertificateStore.getExpiring.mockResolvedValue([
        {
          serialNumber: 'SN-001',
          serviceId: 'svc-1',
          certPem: 'cert',
          caPem: 'ca',
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 10000),
          fingerprint: 'fp',
        },
        {
          serialNumber: 'SN-002',
          serviceId: 'svc-2',
          certPem: 'cert2',
          caPem: 'ca2',
          issuedAt: new Date(),
          expiresAt: new Date(Date.now() + 10000),
          fingerprint: 'fp2',
        },
      ]);

      rotator.start();
      jest.advanceTimersByTime(86400000);
      await jest.advanceTimersByTimeAsync(0);

      expect(logger.error).toHaveBeenCalledWith('Failed to rotate certificate', expect.any(Object));
    });

    it('should log error when rotation fails', async () => {
      mockCertificateStore.getExpiring.mockRejectedValue(new Error('DB error'));

      rotator.start();
      jest.advanceTimersByTime(86400000);
      await jest.advanceTimersByTimeAsync(0);

      expect(logger.error).toHaveBeenCalledWith('Certificate rotation failed', expect.any(Object));
    });
  });
});
