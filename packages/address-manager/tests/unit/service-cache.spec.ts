import { ServiceCache } from '../../src/discovery/service-cache';
import { ServiceInstance } from '../../src/client/type';
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('ServiceCache', () => {
  let cache: ServiceCache;
  const ttlMs = 100;
  const serviceName = 'user-service';
  const instance: ServiceInstance = {
    ip: '127.0.0.1',
    port: 8080,
    instanceId: 'instance-1',
    lastHeartbeat: Date.now(),
    protocol: 'http',
    registeredAt: Date.now(),
    serviceName: serviceName,
    version: '1.0.0',
    ttl: 30000,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    cache = new ServiceCache(ttlMs);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should return null for missing service', async () => {
    expect(await cache.get('unknown-service')).toBeNull();
  });

  test('should store and retrieve a service instance', async () => {
    await cache.set(serviceName, instance);
    const retrieved = await cache.get(serviceName);
    expect(retrieved).toEqual(instance);
  });

  test('should expire an entry after TTL', async () => {
    await cache.set(serviceName, instance);
    jest.advanceTimersByTime(ttlMs + 1);
    expect(await cache.get(serviceName)).toBeNull();
  });

  test('should invalidate a specific service', async () => {
    await cache.set(serviceName, instance);
    await cache.invalidate(serviceName);
    expect(await cache.get(serviceName)).toBeNull();
  });

  test('should clear all services', async () => {
    await cache.set(serviceName, instance);
    await cache.set('other-service', {
      instanceId: '2',
      ip: '127.0.0.2',
      port: 9090,
      protocol: 'http',
      lastHeartbeat: Date.now(),
      registeredAt: Date.now(),
      serviceName: 'other-service',
      ttl: 30000,
    });
    await cache.clear();
    expect(await cache.get(serviceName)).toBeNull();
    expect(await cache.get('other-service')).toBeNull();
  });

  test('should not delete valid entries before TTL', async () => {
    await cache.set(serviceName, instance);
    jest.advanceTimersByTime(ttlMs - 10);
    expect(await cache.get(serviceName)).toEqual(instance);
  });
});
