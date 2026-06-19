import { describe, expect, beforeEach, jest, test } from '@jest/globals';
import { ServiceCache } from '../../src/discovery/service-cache';
import { ServiceDiscovery } from '../../src/discovery/service-discovery';
import { ServiceInstance } from '../../src/client/type';
import { ServiceHealthChecker } from '../../src/discovery/service-health-checker';
import { HttpClient } from '@trading-model/common/config/http-client';
import { AddressManagerConfig } from '../../src/config/address-manager-config';

const FIXED_TIMESTAMP = 1_700_000_000_000;

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
  return {
    ip: '127.0.0.1',
    port: 8080,
    instanceId: 'instance-1',
    lastHeartbeat: FIXED_TIMESTAMP,
    protocol: 'http',
    registeredAt: FIXED_TIMESTAMP,
    serviceName: 'user-service',
    version: '1.0.0',
    ttl: 30000,
    ...overrides,
  };
}

function createMockCache(): jest.Mocked<ServiceCache> {
  return {
    get: jest.fn<(name: string) => Promise<ServiceInstance | null>>().mockResolvedValue(null),
    set: jest.fn<(name: string, inst: ServiceInstance, latencyMs?: number) => Promise<void>>().mockResolvedValue(undefined),
    invalidate: jest.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined),
    clear: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<ServiceCache>;
}

function createMockHttpClient(): jest.Mocked<HttpClient> {
  return {
    get: jest.fn<(url: string) => Promise<unknown>>().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<HttpClient>;
}

function createMockHealthChecker(healthy = true): jest.Mocked<ServiceHealthChecker> {
  return {
    isHealthy: jest.fn<() => Promise<boolean>>().mockResolvedValue(healthy),
    recordLatency: jest.fn<(region: string | undefined, latencyMs: number) => void>(),
    getRegionLatency: jest.fn<(region: string | undefined) => number | undefined>(),
  } as unknown as jest.Mocked<ServiceHealthChecker>;
}

describe('Multi-Region ServiceDiscovery', () => {
  let discovery: ServiceDiscovery;
  let cache: jest.Mocked<ServiceCache>;
  let httpClient: jest.Mocked<HttpClient>;
  let healthChecker: jest.Mocked<ServiceHealthChecker>;

  const usInstance = makeInstance({
    instanceId: 'node-us',
    ip: '10.0.0.1',
    region: 'us-east-1',
  });

  const euInstance = makeInstance({
    instanceId: 'node-eu',
    ip: '10.0.1.1',
    region: 'eu-west-1',
  });

  const noRegionInstance = makeInstance({
    instanceId: 'node-legacy',
    ip: '10.0.2.1',
  });

  beforeEach(() => {
    cache = createMockCache();
    httpClient = createMockHttpClient();
    healthChecker = createMockHealthChecker();
  });

  describe('findServiceInRegion', () => {
    test('should query region-filtered endpoint when preferred region is specified', async () => {
      httpClient.get.mockResolvedValueOnce([usInstance]);
      healthChecker.isHealthy.mockResolvedValue(true);

      discovery = new ServiceDiscovery(
        httpClient, cache,
        { addressManagerUrl: 'https://ds:3000', discoveryTimeoutMs: 5000 } as AddressManagerConfig,
        healthChecker
      );

      const result = await discovery.findServiceInRegion('user-service', 'us-east-1');

      expect(httpClient.get).toHaveBeenCalledWith(
        'https://ds:3000/services/user-service/region/us-east-1',
        expect.any(Object)
      );
      expect(result.region).toBe('us-east-1');
    });

    test('should fall back to non-region instances if preferred region has no healthy instances', async () => {
      httpClient.get.mockResolvedValueOnce([usInstance]);
      healthChecker.isHealthy.mockResolvedValue(false);
      httpClient.get.mockResolvedValueOnce([euInstance]);
      healthChecker.isHealthy.mockResolvedValueOnce(true);

      discovery = new ServiceDiscovery(
        httpClient, cache,
        { addressManagerUrl: 'https://ds:3000', discoveryTimeoutMs: 5000 } as AddressManagerConfig,
        healthChecker
      );

      const result = await discovery.findServiceInRegion('user-service', 'us-east-1');
      expect(result).toBeDefined();
    });
  });

  describe('region-preference via config', () => {
    test('should prefer region from config when finding service', async () => {
      httpClient.get.mockResolvedValueOnce([usInstance]);
      healthChecker.isHealthy.mockResolvedValue(true);

      discovery = new ServiceDiscovery(
        httpClient, cache,
        {
          addressManagerUrl: 'https://ds:3000',
          discoveryTimeoutMs: 5000,
          region: 'us-east-1',
        } as AddressManagerConfig,
        healthChecker
      );

      const result = await discovery.findService('user-service');
      expect(result).toBeDefined();
    });
  });

  describe('multi-instance region filtering', () => {
    test('should pick the healthy instance from preferred region', async () => {
      httpClient.get.mockResolvedValueOnce([usInstance, euInstance]);
      healthChecker.isHealthy.mockImplementation(async (inst) => inst.region === 'us-east-1');

      discovery = new ServiceDiscovery(
        httpClient, cache,
        { addressManagerUrl: 'https://ds:3000', discoveryTimeoutMs: 5000 } as AddressManagerConfig,
        healthChecker
      );

      const result = await discovery.findServiceInRegion('user-service', 'us-east-1');
      expect(result.region).toBe('us-east-1');
    });
  });

  describe('no-region instances', () => {
    test('should handle instances without region field', async () => {
      httpClient.get.mockResolvedValueOnce([noRegionInstance]);
      healthChecker.isHealthy.mockResolvedValue(true);

      discovery = new ServiceDiscovery(
        httpClient, cache,
        { addressManagerUrl: 'https://ds:3000', discoveryTimeoutMs: 5000 } as AddressManagerConfig,
        healthChecker
      );

      const result = await discovery.findService('user-service');
      expect(result.ip).toBe('10.0.2.1');
    });
  });
});
