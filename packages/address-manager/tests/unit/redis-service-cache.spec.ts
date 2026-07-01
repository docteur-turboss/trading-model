import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockRedisInstance: Record<string, jest.Mock<(...args: any[]) => any>> = {
  connect: jest.fn<(...args: any[]) => Promise<void>>().mockResolvedValue(),
  disconnect: jest.fn<(...args: any[]) => void>(),
  get: jest.fn<(...args: any[]) => Promise<string | null>>().mockResolvedValue(null),
  setex: jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('OK'),
  del: jest.fn<(...args: any[]) => Promise<number>>().mockResolvedValue(1),
  scan: jest.fn<(...args: any[]) => Promise<[string, string[]]>>().mockResolvedValue(['0', []]),
  pipeline: jest.fn<(...args: any[]) => any>(),
};

jest.mock('ioredis', () => {
  return jest.fn(() => mockRedisInstance);
});

import { RedisServiceCache } from '../../src/discovery/redis-service-cache';

describe('RedisServiceCache', () => {
  let cache: RedisServiceCache;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = new RedisServiceCache('redis://localhost:6379', 'discovery:cache:', 5000);
  });

  describe('set / get', () => {
    it('should store instance with TTL in seconds', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');
      mockRedisInstance.get.mockResolvedValue(
        JSON.stringify({ serviceName: 'svc', instanceId: 'i-1', ip: '127.0.0.1', port: 8080 })
      );

      await cache.set('svc', {
        serviceName: 'svc',
        instanceId: 'i-1',
        ip: '127.0.0.1',
        port: 8080,
      } as any);
      const result = await cache.get('svc');

      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'discovery:cache:svc',
        5,
        expect.any(String)
      );
      expect(result).not.toBeNull();
    });

    it('should return null when key not found', async () => {
      mockRedisInstance.get.mockResolvedValue(null);
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should use region-prefixed keys when region provided', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');
      await cache.set('svc', { serviceName: 'svc' } as any, 'us-east');
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'discovery:cache:svc::us-east',
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should return null on Redis error', async () => {
      mockRedisInstance.get.mockRejectedValue(new Error('Connection lost'));
      const result = await cache.get('svc');
      expect(result).toBeNull();
    });
  });

  describe('invalidate', () => {
    it('should delete key from Redis', async () => {
      mockRedisInstance.del.mockResolvedValue(1);
      await cache.invalidate('svc');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('discovery:cache:svc');
    });

    it('should handle errors gracefully', async () => {
      mockRedisInstance.del.mockRejectedValue(new Error('error'));
      await expect(cache.invalidate('svc')).resolves.toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should scan and delete all matching keys', async () => {
      mockRedisInstance.scan
        .mockResolvedValueOnce(['1', ['key1', 'key2']])
        .mockResolvedValueOnce(['0', ['key3']]);
      mockRedisInstance.pipeline.mockReturnValue({
        del: jest.fn<() => any>(),
        exec: jest.fn<() => Promise<any>>().mockResolvedValue([[null, 1] as any]),
      } as any);

      await cache.clear();

      expect(mockRedisInstance.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'discovery:cache:*',
        'COUNT',
        200
      );
    });

    it('should handle empty scan result', async () => {
      mockRedisInstance.scan.mockResolvedValue(['0', []]);
      await cache.clear();
      expect(mockRedisInstance.pipeline).not.toHaveBeenCalled();
    });
  });

  describe('circuit state', () => {
    it('should store circuit state with 2x TTL', async () => {
      mockRedisInstance.setex.mockResolvedValue('OK');
      await cache.setCircuitState('i-1', { failures: 3, lastFailureTime: 1000, state: 'OPEN' });
      expect(mockRedisInstance.setex).toHaveBeenCalledWith(
        'discovery:cache:circuit:i-1',
        10,
        expect.any(String)
      );
    });

    it('should retrieve circuit state', async () => {
      const state = { failures: 3, lastFailureTime: 1000, state: 'OPEN' as const };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(state));
      const result = await cache.getCircuitState('i-1');
      expect(result).toEqual(state);
    });

    it('should delete circuit state', async () => {
      mockRedisInstance.del.mockResolvedValue(1);
      await cache.deleteCircuitState('i-1');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('discovery:cache:circuit:i-1');
    });
  });

  describe('entries', () => {
    it('should return empty array', async () => {
      const result = await cache.entries();
      expect(result).toEqual([]);
    });
  });

  describe('constructor', () => {
    it('should compute ttlSec as Math.max(1, ceil(ttlMs/1000))', () => {
      const c = new RedisServiceCache('redis://localhost:6379', 'p:', 1);
      expect((c as any).ttlSec).toBe(1);

      const c2 = new RedisServiceCache('redis://localhost:6379', 'p:', 999);
      expect((c2 as any).ttlSec).toBe(1);

      const c3 = new RedisServiceCache('redis://localhost:6379', 'p:', 1000);
      expect((c3 as any).ttlSec).toBe(1);

      const c4 = new RedisServiceCache('redis://localhost:6379', 'p:', 1500);
      expect((c4 as any).ttlSec).toBe(2);
    });
  });
});
