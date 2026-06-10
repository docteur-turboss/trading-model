import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ServiceRegistry } from '../../src/core/service-registry';

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../src/config/env', () => ({
  env: { CLEANUP_SERVICE_INTERVAL_MS: 5000, ERROR_URL_WEBHOOK: 'https://hooks.example.com/error' },
}));

describe('Discovery Service — Full Flow Integration', () => {
  let registry: ServiceRegistry;

  beforeEach(() => {
    jest.clearAllMocks();
    registry = new ServiceRegistry();
  });

  it('should register an instance and find it via getInstances', () => {
    const result = registry.registerInstance({
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
      ttl: 30_000,
      protocol: 'mtls',
      version: '1.0.0',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    });

    expect(result.instanceId).toBe('node-1');
    expect(result.token).toBeDefined();

    const instances = registry.getInstances('financial-scraper-service');
    expect(instances).toHaveLength(1);
    expect(instances[0].ip).toBe('10.0.0.1');
  });

  it('should register multiple instances for the same service', () => {
    registry.registerInstance({
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
      ttl: 30_000,
      protocol: 'mtls',
      version: '1.0.0',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    });

    registry.registerInstance({
      serviceName: 'financial-scraper-service',
      instanceId: 'node-2',
      ip: '10.0.0.2',
      port: 8444,
      ttl: 30_000,
      protocol: 'mtls',
      version: '1.0.0',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    });

    expect(registry.getInstances('financial-scraper-service')).toHaveLength(2);
  });

  it('should validate instance tokens after registration', () => {
    const registered = registry.registerInstance({
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
      ttl: 30_000,
      protocol: 'mtls',
      version: '1.0.0',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    });

    expect(registry.validInstanceToken(registered.token as string, 'node-1')).toBe(true);
    expect(registry.validInstanceToken('wrong-token', 'node-1')).toBe(false);
  });

  it('should handle full heartbeat flow', () => {
    const registered = registry.registerInstance({
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
      ttl: 30_000,
      protocol: 'mtls',
      version: '1.0.0',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    });

    const token = registered.token as string;
    expect(registry.validInstanceToken(token, 'node-1')).toBe(true);

    const ttl = registry.updateHeartbeat('financial-scraper-service', 'node-1');
    expect(ttl).toBe(30_000);

    const newToken = registry.updateToken('node-1');
    expect(newToken).not.toBe(token);
    expect(registry.validInstanceToken(newToken, 'node-1')).toBe(true);
    expect(registry.validInstanceToken(token, 'node-1')).toBe(false);
  });

  it('should remove instance and update token on removeInstance', () => {
    registry.registerInstance({
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
      ttl: 30_000,
      protocol: 'mtls',
      version: '1.0.0',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    });

    registry.registerInstance({
      serviceName: 'message-delivery-service',
      instanceId: 'msg-1',
      ip: '10.0.0.2',
      port: 8445,
      ttl: 60_000,
      protocol: 'mtls',
      version: '1.0.0',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    });

    const removed = registry.removeInstance('financial-scraper-service', 'node-1');
    expect(removed).toBe(true);
    expect(registry.getInstances('financial-scraper-service')).toHaveLength(0);
    expect(registry.validInstanceToken('any-token', 'node-1')).toBe(false);
    expect(registry.listServiceNames()).toEqual(['message-delivery-service']);
  });

  it('should expose a dump of current registry state', () => {
    registry.registerInstance({
      serviceName: 'financial-scraper-service',
      instanceId: 'node-1',
      ip: '10.0.0.1',
      port: 8444,
      ttl: 30_000,
      protocol: 'mtls',
      version: '1.0.0',
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
    });

    const snapshot = registry.dump();
    expect(snapshot['financial-scraper-service']).toBeDefined();
    expect(snapshot['financial-scraper-service']).toHaveLength(1);
  });

  it('should verify instance names against known services', () => {
    expect(registry.verifyInstanceName('financial-scraper-service')).toBe(true);
    expect(registry.verifyInstanceName('message-delivery-service')).toBe(true);
    expect(registry.verifyInstanceName('discovery-service')).toBe(true);
    expect(registry.verifyInstanceName('completely-fake-service')).toBe(false);
  });
});
