import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { ServiceInstance } from '../../src/core/types';

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.useFakeTimers();

import { ServiceRegistry } from '../../src/core/service-registry';
import { LeaseManager } from '../../src/core/lease-manager';

describe('LeaseManager', () => {
  let leaseManager: LeaseManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    leaseManager = new LeaseManager(new ServiceRegistry());
  });

  afterEach(() => {
    leaseManager.stop();
  });

  describe('start', () => {
    it('should set an interval', () => {
      const spy = jest.spyOn(global, 'setInterval');
      leaseManager.start();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(expect.any(Function), 5000);
      spy.mockRestore();
    });

    it('should be idempotent', () => {
      const spy = jest.spyOn(global, 'setInterval');
      leaseManager.start();
      leaseManager.start();
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  describe('stop', () => {
    it('should clear the interval', () => {
      const spy = jest.spyOn(global, 'clearInterval');
      leaseManager.start();
      leaseManager.stop();
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('should be idempotent when not started', () => {
      expect(() => leaseManager.stop()).not.toThrow();
    });
  });

  describe('isAlive', () => {
    it('should return true for recent heartbeat', () => {
      const registry = new ServiceRegistry();
      const lm = new LeaseManager(registry);
      const instance: ServiceInstance = {
        serviceName: 'test',
        instanceId: 'i1',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now() - 1000,
        lastHeartbeat: Date.now(),
      };
      expect(lm.isAlive(instance)).toBe(true);
    });

    it('should return false for expired heartbeat', () => {
      const registry = new ServiceRegistry();
      const lm = new LeaseManager(registry);
      const instance: ServiceInstance = {
        serviceName: 'test',
        instanceId: 'i1',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now() - 120_000,
        lastHeartbeat: Date.now() - 60_000,
      };
      expect(lm.isAlive(instance)).toBe(false);
    });

    it('should return true at TTL boundary', () => {
      const registry = new ServiceRegistry();
      const lm = new LeaseManager(registry);
      const instance: ServiceInstance = {
        serviceName: 'test',
        instanceId: 'i1',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now() - 60_000,
        lastHeartbeat: Date.now() - 30_000,
      };
      expect(lm.isAlive(instance)).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove expired instances on interval tick', () => {
      const registry = new ServiceRegistry();

      registry.registerInstance({
        serviceName: 'financial-scrapper-service',
        instanceId: 'expired-id',
        ip: '1.1.1.1',
        port: 8080,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      });

      registry.registerInstance({
        serviceName: 'financial-scrapper-service',
        instanceId: 'alive-id',
        ip: '1.1.1.2',
        port: 8081,
        ttl: 30000,
        protocol: 'mtls',
        registeredAt: Date.now(),
        lastHeartbeat: Date.now(),
      });

      const lm = new LeaseManager(registry);
      jest.spyOn(registry, 'dump').mockReturnValue({
        'financial-scrapper-service': [
          {
            serviceName: 'financial-scrapper-service',
            instanceId: 'expired-id',
            ip: '1.1.1.1',
            port: 8080,
            ttl: 30000,
            protocol: 'mtls',
            registeredAt: Date.now() - 120_000,
            lastHeartbeat: Date.now() - 60_000,
          },
          {
            serviceName: 'financial-scrapper-service',
            instanceId: 'alive-id',
            ip: '1.1.1.2',
            port: 8081,
            ttl: 30000,
            protocol: 'mtls',
            registeredAt: Date.now() - 1000,
            lastHeartbeat: Date.now(),
          },
        ],
      });

      lm.start();
      jest.advanceTimersByTime(5000);

      const remaining = registry.getInstances('financial-scrapper-service');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].instanceId).toBe('alive-id');
    });

    it('should log error when cleanup throws', () => {
      const registry = new ServiceRegistry();
      const lm = new LeaseManager(registry);

      jest.spyOn(registry, 'dump').mockImplementation(() => {
        throw new Error('cleanup failed');
      });

      lm.start();
      jest.advanceTimersByTime(5000);

      const { logger } = jest.requireMock<{ logger: { error: jest.Mock } }>(
        '@trading-model/common/config/logger'
      );
      expect(logger.error).toHaveBeenCalledWith('[LeaseManager] Cleanup error:', {
        error: new Error('cleanup failed'),
      });
    });
  });
});
