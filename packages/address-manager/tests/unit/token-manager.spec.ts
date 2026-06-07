import { TokenManager } from '../../src/client/token-manager';
import { HttpClient } from '@trading-model/common/config/http-client';
import { AddressManagerConfig } from '../../src/config/address-manager-config';
import { AppError, ErrorCodes } from '@trading-model/common/utils/errors';
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

describe('TokenManager', () => {
  let httpClient: jest.Mocked<HttpClient>;
  let config: AddressManagerConfig;
  let manager: TokenManager;

  beforeEach(() => {
    httpClient = { post: jest.fn() } as unknown as jest.Mocked<HttpClient>;

    config = {
      addressManagerUrl: 'http://localhost:8443',
      instanceId: 'instance-1',
      serviceName: 'test-service',
      servicePort: 8080,
      tokenRefreshIntervalMs: 300_000,
      ttlRefreshIntervalMs: 300_000,
      servicePingTimeoutMs: 2000,
      cacheTtlMs: 60_000,
    } as AddressManagerConfig;

    manager = new TokenManager(httpClient, config);
  });

  describe('getToken', () => {
    test('should throw AuthenticationError if token is not available', () => {
      expect(() => manager.getToken()).toThrow(AppError);
      expect(() => manager.getToken()).toThrow(
        'Token is not available. Did you call refreshToken()?'
      );
    });

    test('should return the token after successful refresh', async () => {
      const mockToken = 'abc123';
      httpClient.post.mockResolvedValueOnce({ token: mockToken });
      manager.setToken('initial-token');

      await manager.refreshToken();

      const token = manager.getToken();
      expect(token).toBe(mockToken);
    });
  });

  describe('setToken', () => {
    test('should set the token and make it available via getToken', () => {
      manager.setToken('direct-token');
      expect(manager.getToken()).toBe('direct-token');
    });
  });

  describe('clearToken', () => {
    test('should clear the stored token', () => {
      manager.setToken('some-token');
      manager.clearToken();
      expect(() => manager.getToken()).toThrow(AppError);
    });
  });

  describe('refreshToken', () => {
    test('should call HttpClient.post with correct URL and payload', async () => {
      const mockToken = 'rotated-token';
      httpClient.post.mockResolvedValueOnce({ token: mockToken });
      manager.setToken('initial-token');

      await manager.refreshToken();

      expect(httpClient.post).toHaveBeenCalledWith(
        `${config.addressManagerUrl}/token/rotate`,
        {
          instanceId: config.instanceId,
          serviceName: config.serviceName,
        },
        {
          headers: { 'x-instance-token': 'initial-token' },
        }
      );

      expect(manager.getToken()).toBe(mockToken);
    });

    test('should throw AuthenticationError if response is missing token', async () => {
      httpClient.post.mockResolvedValueOnce({});
      manager.setToken('initial-token');

      await expect(manager.refreshToken()).rejects.toThrow(AppError);
      await expect(manager.refreshToken()).rejects.toThrow(
        'Invalid token response from Address Manager'
      );
    });

    test('should throw AuthenticationError if HttpClient.post throws', async () => {
      const error = new Error('Network failure');
      httpClient.post.mockRejectedValueOnce(error);
      manager.setToken('initial-token');
      await expect(manager.refreshToken()).rejects.toThrow(AppError);

      httpClient.post.mockRejectedValueOnce(error);
      manager.setToken('initial-token');
      await expect(manager.refreshToken()).rejects.toMatchObject({
        message: 'Failed to refresh authentication token',
      });
    });
  });
});
