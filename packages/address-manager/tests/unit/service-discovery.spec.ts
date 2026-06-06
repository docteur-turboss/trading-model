import { ServiceCache } from '../../src/discovery/service-cache';
import { ServiceDiscovery } from '../../src/discovery/service-discovery';
import { ServiceInstance } from '../../src/client/type';
import { ServiceHealthChecker } from '../../src/discovery/service-health-checker';
import { HttpClient } from '@trading-model/common/config/http-client';
import { AddressManagerConfig } from '../../src/config/address-manager-config';
import { ServiceNotFoundError, ServiceUnreachableError } from '@trading-model/common/utils/errors';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('ServiceDiscovery', () => {
  let discovery: ServiceDiscovery;
  let cache: jest.Mocked<ServiceCache>;
  let httpClient: jest.Mocked<HttpClient>;
  let healthChecker: jest.Mocked<ServiceHealthChecker>;

  const serviceName = 'user-service';
  const instance: ServiceInstance = {
    ip: '127.0.0.1',
    port: 8080,
    instanceId: 'instance-1',
    lastHeartbeat: Date.now(),
    protocol: 'http',
    registeredAt: Date.now(),
    serviceName: serviceName,
    ttl: 30000,
  };

  beforeEach(() => {
    cache = {
      get: jest.fn(),
      set: jest.fn(),
      invalidate: jest.fn(),
      clear: jest.fn(),
    } as unknown as jest.Mocked<ServiceCache>;

    httpClient = {
      get: jest.fn(),
    } as unknown as jest.Mocked<HttpClient>;

    healthChecker = {
      isHealthy: jest.fn(),
    } as unknown as jest.Mocked<ServiceHealthChecker>;

    discovery = new ServiceDiscovery(
      httpClient,
      cache,
      {
        addressManagerUrl: 'ee',
      } as AddressManagerConfig,
      healthChecker
    );
  });

  test('returns cached instance if healthy', async () => {
    cache.get.mockReturnValue(instance);
    healthChecker.isHealthy.mockResolvedValue(true);

    const result = await discovery.findService(serviceName);

    expect(result).toEqual(instance);
    expect(cache.get).toHaveBeenCalledWith(serviceName);
    expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  test('fetches from AddressManager if cache is empty', async () => {
    cache.get.mockReturnValue(null);
    httpClient.get.mockResolvedValueOnce(instance);
    healthChecker.isHealthy.mockResolvedValue(true);

    const result = await discovery.findService(serviceName);

    expect(result).toEqual(instance);
    expect(healthChecker.isHealthy).toHaveBeenCalledWith(instance);
    expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
  });

  test('invalidates cache and refetches if cached instance is unhealthy', async () => {
    cache.get.mockReturnValue(instance);
    httpClient.get.mockResolvedValueOnce(instance);
    healthChecker.isHealthy.mockResolvedValueOnce(false); // cached instance unhealthy
    healthChecker.isHealthy.mockResolvedValueOnce(true); // newly fetched instance healthy

    const result = await discovery.findService(serviceName);

    expect(cache.invalidate).toHaveBeenCalledWith(serviceName);
    expect(result).toEqual(instance);
    expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
  });

  test('throws ServiceNotFoundError if service not registered', async () => {
    cache.get.mockReturnValue(null);
    httpClient.get.mockRejectedValue('');

    await expect(discovery.findService(serviceName)).rejects.toThrow(ServiceNotFoundError);

    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  test('throws ServiceUnreachableError if fetched service is unhealthy', async () => {
    cache.get.mockReturnValue(null);
    httpClient.get.mockResolvedValueOnce(instance);
    healthChecker.isHealthy.mockResolvedValue(false);

    await expect(discovery.findService(serviceName)).rejects.toThrow(ServiceUnreachableError);

    expect(cache.invalidate).toHaveBeenCalledWith(serviceName);
    expect(cache.set).not.toHaveBeenCalled();
  });

  test('sets fetched healthy service in cache', async () => {
    cache.get.mockReturnValue(null);
    httpClient.get.mockResolvedValueOnce(instance);
    healthChecker.isHealthy.mockResolvedValue(true);

    await discovery.findService(serviceName);

    expect(cache.set).toHaveBeenCalledWith(serviceName, instance);
  });
});
