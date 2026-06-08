import { ServiceCache } from '../../src/discovery/service-cache';
import { ServiceDiscovery } from '../../src/discovery/service-discovery';
import { ServiceInstance } from '../../src/client/type';
import { ServiceHealthChecker } from '../../src/discovery/service-health-checker';
import { HttpClient } from '@trading-model/common/config/http-client';
import { AddressManagerConfig } from '../../src/config/address-manager-config';
import { AppError, ErrorCodes } from '@trading-model/common/utils/errors';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('ServiceDiscovery', () => {
  let discovery: ServiceDiscovery;
  let cache: jest.Mocked<ServiceCache>;
  let httpClient: jest.Mocked<HttpClient>;
  let healthChecker: jest.Mocked<ServiceHealthChecker>;

  const FIXED_TIMESTAMP = 1_700_000_000_000;
  const serviceName = 'user-service';
  const instance: ServiceInstance = {
    ip: '127.0.0.1',
    port: 8080,
    instanceId: 'instance-1',
    lastHeartbeat: FIXED_TIMESTAMP,
    protocol: 'http',
    registeredAt: FIXED_TIMESTAMP,
    serviceName: serviceName,
    ttl: 30000,
  };

  beforeEach(() => {
    cache = {
      get: jest
        .fn<(serviceName: string) => Promise<ServiceInstance | null>>()
        .mockResolvedValue(null),
      set: jest
        .fn<(serviceName: string, instance: ServiceInstance) => Promise<void>>()
        .mockResolvedValue(undefined),
      invalidate: jest.fn<(serviceName: string) => Promise<void>>().mockResolvedValue(undefined),
      clear: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ServiceCache>;

    httpClient = {
      get: jest
        .fn<(url: string, options?: Record<string, unknown>) => Promise<unknown>>()
        .mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HttpClient>;

    healthChecker = {
      isHealthy: jest.fn<(instance: ServiceInstance) => Promise<boolean>>().mockResolvedValue(true),
    } as unknown as jest.Mocked<ServiceHealthChecker>;

    discovery = new ServiceDiscovery(
      httpClient,
      cache,
      {
        addressManagerUrl: 'ee',
        discoveryTimeoutMs: 5000,
      } as AddressManagerConfig,
      healthChecker
    );
  });

  test('returns cached instance if healthy', async () => {
    cache.get.mockResolvedValue(instance);
    healthChecker.isHealthy.mockResolvedValue(true);

    const result = await discovery.findService(serviceName);

    expect(result).toEqual(instance);
    expect(cache.get).toHaveBeenCalledWith(serviceName);
    expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  test('fetches from AddressManager if cache is empty', async () => {
    cache.get.mockResolvedValue(null);
    httpClient.get.mockResolvedValueOnce(instance);
    healthChecker.isHealthy.mockResolvedValue(true);

    const result = await discovery.findService(serviceName);

    expect(result).toEqual(instance);
    expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
    expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
  });

  test('invalidates cache and refetches if cached instance is unhealthy', async () => {
    cache.get.mockResolvedValue(instance);
    httpClient.get.mockResolvedValueOnce(instance);
    healthChecker.isHealthy.mockResolvedValueOnce(false);
    healthChecker.isHealthy.mockResolvedValueOnce(true);

    const result = await discovery.findService(serviceName);

    expect(cache.invalidate).toHaveBeenCalledWith(serviceName);
    expect(result).toEqual(instance);
    expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
  });

  test('throws ServiceNotFoundError if service not registered', async () => {
    cache.get.mockResolvedValue(null);
    httpClient.get.mockRejectedValue('');

    await expect(discovery.findService(serviceName)).rejects.toThrow(AppError);

    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  test('passes timeout option to HttpClient.get', async () => {
    cache.get.mockResolvedValue(null);
    httpClient.get.mockResolvedValueOnce(instance);
    healthChecker.isHealthy.mockResolvedValue(true);

    await discovery.findService(serviceName);

    expect(httpClient.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeoutMs: 5000 })
    );
  });

  test('handles array response from AddressManager by taking first element', async () => {
    cache.get.mockResolvedValue(null);
    httpClient.get.mockResolvedValueOnce([instance]);
    healthChecker.isHealthy.mockResolvedValue(true);

    const result = await discovery.findService(serviceName);

    expect(result).toEqual(instance);
    expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
  });

  test('throws ServiceNotFoundError when AddressManager returns empty instances', async () => {
    cache.get.mockResolvedValue(null);
    httpClient.get.mockResolvedValueOnce(null);

    await expect(discovery.findService(serviceName)).rejects.toThrow(AppError);
    await expect(discovery.findService(serviceName)).rejects.toMatchObject({
      message: 'Service "user-service" has no registered instances',
    });

    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  test('throws ServiceUnreachableError if fetched service is unhealthy', async () => {
    cache.get.mockResolvedValue(null);
    httpClient.get.mockResolvedValueOnce(instance);
    healthChecker.isHealthy.mockResolvedValue(false);

    await expect(discovery.findService(serviceName)).rejects.toThrow(AppError);

    expect(cache.invalidate).toHaveBeenCalledWith(serviceName);
    expect(cache.set).not.toHaveBeenCalled();
  });

  test('sets fetched healthy service in cache', async () => {
    cache.get.mockResolvedValue(null);
    httpClient.get.mockResolvedValueOnce(instance);
    healthChecker.isHealthy.mockResolvedValue(true);

    await discovery.findService(serviceName);

    expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
  });
});
