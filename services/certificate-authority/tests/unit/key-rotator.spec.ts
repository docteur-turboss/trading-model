import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../src/config/env', () => ({
  env: {},
}));

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

import { logger } from '@trading-model/common/config/logger';
import { KeyRotator } from '../../src/core/key-rotator';

const mockCa = {
  getCurrentKeyId: jest.fn(),
  getKeyVersion: jest.fn(),
  rotateKey: jest.fn(),
  cleanupKeyHistory: jest.fn(),
};

describe('KeyRotator', () => {
  let rotator: KeyRotator;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    rotator = new KeyRotator({
      ca: mockCa as any,
      intervalMs: 3600000,
      retentionCount: 3,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('should set an interval timer', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      rotator.start();

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 3600000);
    });

    it('should not start a second timer if already running', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');

      rotator.start();
      rotator.start();

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    });

    it('should log starting message', () => {
      rotator.start();

      expect(logger.info).toHaveBeenCalledWith('Starting CA key rotator', {
        intervalMs: 3600000,
        retentionCount: 3,
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

      expect(logger.info).toHaveBeenCalledWith('CA key rotator stopped');
    });

    it('should not throw if stopping without starting', () => {
      expect(() => rotator.stop()).not.toThrow();
    });
  });

  describe('rotation logic', () => {
    it('should rotate key and cleanup on each interval', async () => {
      mockCa.getCurrentKeyId.mockReturnValue('old-key');
      mockCa.getKeyVersion.mockReturnValue(1);
      mockCa.rotateKey.mockResolvedValue('new-key');

      rotator.start();
      jest.advanceTimersByTime(3600000);
      await jest.advanceTimersByTimeAsync(0);

      expect(mockCa.rotateKey).toHaveBeenCalled();
      expect(mockCa.cleanupKeyHistory).toHaveBeenCalledWith(3);
    });

    it('should log key rotation success', async () => {
      mockCa.getCurrentKeyId.mockReturnValueOnce('old-key').mockReturnValueOnce('new-key');
      mockCa.getKeyVersion.mockReturnValueOnce(1).mockReturnValueOnce(2);
      mockCa.rotateKey.mockResolvedValue('new-key');

      rotator.start();
      jest.advanceTimersByTime(3600000);
      await jest.advanceTimersByTimeAsync(0);

      expect(logger.info).toHaveBeenCalledWith('CA key rotated', {
        previousKeyId: 'old-key',
        previousVersion: 1,
        newKeyId: 'new-key',
        newVersion: 2,
      });
    });

    it('should log error when rotation fails', async () => {
      mockCa.rotateKey.mockRejectedValue(new Error('rotate failed'));

      rotator.start();
      jest.advanceTimersByTime(3600000);
      await jest.advanceTimersByTimeAsync(0);

      expect(logger.error).toHaveBeenCalledWith('CA key rotation failed', expect.any(Object));
    });
  });
});
