import { networkInterfaces } from 'os';
import { TokenManager } from '../../src/client/token-manager';
import { ServiceRegistrationResponse } from '../../src/client/type';
import { AddressManagerClient } from '../../src/client/address-manager-client';
import { afterAll } from '@jest/globals';
import { HttpClient } from '@trading-model/common/config/http-client';
import { AddressManagerConfig } from '../../src/config/address-manager-config';
import { AppError } from '@trading-model/common/utils/errors';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

jest.mock('os');

describe('AddressManagerClient', () => {
  let httpClient: jest.Mocked<HttpClient>;
  let tokenManager: jest.Mocked<TokenManager>;
  let config: AddressManagerConfig;
  let client: AddressManagerClient;

  afterAll(() => {
    AddressManagerClient.resetLocalIP();
  });

  beforeEach(() => {
    AddressManagerClient.resetLocalIP();
    (networkInterfaces as jest.Mock).mockReturnValue({
      eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.100' }],
    });

    httpClient = { get: jest.fn(), post: jest.fn() } as unknown as jest.Mocked<HttpClient>;
    tokenManager = { getToken: jest.fn() } as unknown as jest.Mocked<TokenManager>;
    tokenManager.getToken.mockReturnValue('mock-token');

    config = {
      addressManagerUrl: 'http://localhost:8443',
      serviceName: 'test-service',
      servicePort: 8080,
      instanceId: 'test-instance',
      tokenRefreshIntervalMs: 300_000,
      ttlRefreshIntervalMs: 300_000,
      servicePingTimeoutMs: 2000,
      cacheTtlMs: 60_000,
    } as AddressManagerConfig;

    client = new AddressManagerClient(httpClient, tokenManager, config);
  });

  describe('registerService', () => {
    test('should use cached IP on subsequent calls', async () => {
      (networkInterfaces as jest.Mock).mockReturnValue({
        eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.100' }],
      });

      httpClient.post.mockResolvedValue({} as ServiceRegistrationResponse);

      await client.registerService();
      (networkInterfaces as jest.Mock).mockClear();

      await client.registerService();

      expect(networkInterfaces).not.toHaveBeenCalled();
    });

    test('should handle undefined network interface entries gracefully', async () => {
      (networkInterfaces as jest.Mock).mockReturnValueOnce({
        wlan0: undefined,
        eth0: [{ family: 'IPv4', internal: false, address: '192.168.1.100' }],
      });

      httpClient.post.mockResolvedValueOnce({} as ServiceRegistrationResponse);
      await client.registerService();

      expect(httpClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          ip: '192.168.1.100',
        })
      );
    });

    test('should fallback to 127.0.0.1 when no non-internal IPv4 interface exists', async () => {
      (networkInterfaces as jest.Mock).mockReturnValueOnce({
        lo: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
      });

      const response: ServiceRegistrationResponse = {
        ip: '127.0.0.1',
        port: 8080,
        instanceId: 'instance-1',
        lastHeartbeat: Date.now(),
        protocol: 'http',
        registeredAt: Date.now(),
        serviceName: 'abc-service',
        token: 'service-token',
        ttl: 30000,
        version: '1.0.0',
      };
      httpClient.post.mockResolvedValueOnce(response);

      const result = await client.registerService();

      expect(httpClient.post).toHaveBeenCalledWith(expect.any(String), {
        serviceName: config.serviceName,
        port: config.servicePort,
        ip: expect.any(String),
      });
      expect(result).toEqual(response);
    });

    test('should call HttpClient.post with correct URL, payload, and headers', async () => {
      const response: ServiceRegistrationResponse = {
        ip: '192.168.1.100',
        port: 8080,
        instanceId: 'instance-1',
        lastHeartbeat: Date.now(),
        protocol: 'http',
        registeredAt: Date.now(),
        serviceName: 'abc-service',
        token: 'service-token',
        ttl: 30000,
        version: '1.0.0',
      };
      httpClient.post.mockResolvedValueOnce(response);

      const result = await client.registerService();

      expect(result).toEqual(response);
      expect(httpClient.post).toHaveBeenCalledWith(`${config.addressManagerUrl}/register`, {
        serviceName: config.serviceName,
        port: config.servicePort,
        ip: '192.168.1.100',
      });
    });

    test('should throw AddressManagerError preserving original cause when HttpClient.post fails', async () => {
      const error = new Error('Network failure');

      httpClient.post.mockRejectedValueOnce(error);
      const err = await client.registerService().catch(e => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).cause).toBe(error);
    });
  });

  describe('refreshTTL', () => {
    test('should call HttpClient.post with correct URL and headers', async () => {
      httpClient.post.mockResolvedValueOnce(undefined);

      await client.refreshTTL();

      expect(httpClient.post).toHaveBeenCalledWith(
        `${config.addressManagerUrl}/heartbeat`,
        { serviceName: config.serviceName, instanceId: config.instanceId },
        { headers: { 'x-instance-token': 'mock-token' } }
      );
    });

    test('should throw AddressManagerError preserving original cause when HttpClient.post fails', async () => {
      const error = new Error('TTL refresh failed');

      httpClient.post.mockRejectedValueOnce(error);
      const err = await client.refreshTTL().catch(e => e);
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).cause).toBe(error);
    });

    test('should use discoveryUrls for concurrent TTL refresh when multiple URLs configured', async () => {
      config = {
        ...config,
        discoveryUrls: ['https://ds1:3000', 'https://ds2:3000'],
      } as AddressManagerConfig;
      client = new AddressManagerClient(httpClient, tokenManager, config);
      httpClient.post.mockResolvedValue(undefined);

      await client.refreshTTL();

      expect(httpClient.post).toHaveBeenCalledWith(
        'https://ds1:3000/heartbeat',
        expect.any(Object),
        expect.any(Object)
      );
      expect(httpClient.post).toHaveBeenCalledWith(
        'https://ds2:3000/heartbeat',
        expect.any(Object),
        expect.any(Object)
      );
    });

    test('should throw when all concurrent TTL refresh URLs fail', async () => {
      config = {
        ...config,
        discoveryUrls: ['https://ds1:3000', 'https://ds2:3000'],
      } as AddressManagerConfig;
      client = new AddressManagerClient(httpClient, tokenManager, config);

      httpClient.post
        .mockRejectedValueOnce(new Error('DS1 down'))
        .mockRejectedValueOnce(new Error('DS2 down'));

      await expect(client.refreshTTL()).rejects.toThrow(AppError);
    });

    test('should succeed when at least one concurrent TTL refresh URL succeeds', async () => {
      config = {
        ...config,
        discoveryUrls: ['https://ds1:3000', 'https://ds2:3000'],
      } as AddressManagerConfig;
      client = new AddressManagerClient(httpClient, tokenManager, config);

      httpClient.post.mockRejectedValueOnce(new Error('DS1 down')).mockResolvedValueOnce(undefined);

      await expect(client.refreshTTL()).resolves.toBeUndefined();
    });
  });
});
