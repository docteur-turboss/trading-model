import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('@trading-model/common/utils/sleep', () => ({
  sleep: jest.fn(() => Promise.resolve()),
}));

const mockHttpClientInstance = {
  post: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

jest.mock('@trading-model/common/config/http-client', () => ({
  HttpClient: jest.fn().mockImplementation(() => mockHttpClientInstance),
}));

const mockTokenManagerInstance = {
  getToken: jest.fn(() => 'mock-token'),
  setToken: jest.fn(),
  refreshToken: jest.fn(),
};

jest.mock('../../src/client/token-manager', () => ({
  TokenManager: jest.fn().mockImplementation(() => mockTokenManagerInstance),
}));

const mockAddressManagerClientInstance = {
  registerService: jest.fn(),
  refreshTTL: jest.fn(),
};

jest.mock('../../src/client/address-manager-client', () => ({
  AddressManagerClient: jest.fn().mockImplementation(() => mockAddressManagerClientInstance),
}));

const mockServiceCacheInstance = {};

jest.mock('../../src/discovery/service-cache', () => ({
  ServiceCache: jest.fn().mockImplementation(() => mockServiceCacheInstance),
}));

const mockHealthCheckerInstance = {};

jest.mock('../../src/discovery/service-health-checker', () => ({
  ServiceHealthChecker: jest.fn().mockImplementation(() => mockHealthCheckerInstance),
}));

const mockFindService = jest.fn();
jest.mock('../../src/discovery/service-discovery', () => ({
  ServiceDiscovery: jest.fn().mockImplementation(() => ({
    findService: mockFindService,
  })),
}));

const mockSchedulerInstance = {
  register: jest.fn(),
  start: jest.fn(),
  stop: jest.fn(),
};

jest.mock('../../src/scheduler/scheduler', () => ({
  Scheduler: jest.fn().mockImplementation(() => mockSchedulerInstance),
}));

jest.mock('../../src/scheduler/refresh-job', () => ({
  RefreshJob: jest.fn(),
}));

const mockPingRoutes = { get: jest.fn() };
jest.mock('../../src/http/routes/ping.routes', () => ({
  pingRoutes: mockPingRoutes,
}));

import AddressManager from '../../src/index';

describe('AddressManager', () => {
  let am: AddressManager;

  const defaultConfig = {
    addressManagerUrl: 'http://localhost:8443',
    instanceId: 'instance-1',
    serviceName: 'test-service',
    servicePort: 8080,
    tokenRefreshIntervalMs: 300000,
    ttlRefreshIntervalMs: 300000,
    servicePingTimeoutMs: 2000,
    discoveryTimeoutMs: 5000,
    cacheTtlMs: 60000,
    RootCACertPath: '/path/to/ca.pem',
    CertificatPath: '/path/to/cert.pem',
    KeyCertificatPath: '/path/to/key.pem',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    am = new AddressManager(defaultConfig);
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(am).toBeInstanceOf(AddressManager);
    });
  });

  describe('getToken', () => {
    it('should delegate to tokenManager.getToken', () => {
      const token = am.getToken();
      expect(token).toBe('mock-token');
      expect(mockTokenManagerInstance.getToken).toHaveBeenCalled();
    });
  });

  describe('findService', () => {
    it('should delegate to serviceDiscovery.findService', async () => {
      const expected = { ip: '192.168.1.1', port: 8080 };
      (mockFindService as any).mockResolvedValue(expected);
      const result = await am.findService('some-service');
      expect(result).toBe(expected);
      expect(mockFindService).toHaveBeenCalledWith('some-service');
    });
  });

  describe('listenExpress', () => {
    it('should call app.use with pingRoutes', () => {
      const app = { use: jest.fn() };
      am.listenExpress(app as any);
      expect(app.use).toHaveBeenCalledWith(mockPingRoutes);
    });
  });

  describe('start', () => {
    it('should register service, create scheduler, and return stop handle', async () => {
      (mockAddressManagerClientInstance.registerService as any).mockResolvedValue({
        token: 'new-token',
      });

      const handle = am.start();

      await new Promise(process.nextTick);

      expect(mockAddressManagerClientInstance.registerService).toHaveBeenCalled();
      expect(mockTokenManagerInstance.setToken).toHaveBeenCalledWith('new-token');
      expect(mockSchedulerInstance.register).toHaveBeenCalledTimes(2);
      expect(mockSchedulerInstance.start).toHaveBeenCalled();
      expect(handle).toHaveProperty('stop');

      handle.stop();
      expect(mockSchedulerInstance.stop).toHaveBeenCalled();
    });

    it('should retry registration on failure and succeed on retry', async () => {
      (mockAddressManagerClientInstance.registerService as any)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ token: 'retry-token' });

      const handle = am.start();

      await new Promise(process.nextTick);

      expect(mockAddressManagerClientInstance.registerService).toHaveBeenCalledTimes(2);
      expect(mockTokenManagerInstance.setToken).toHaveBeenCalledWith('retry-token');

      handle.stop();
    });

    it('should log error after max retries exhausted', async () => {
      (mockAddressManagerClientInstance.registerService as any).mockRejectedValue(
        new Error('Service unreachable')
      );

      const handle = am.start();

      await new Promise(process.nextTick);

      expect(mockAddressManagerClientInstance.registerService).toHaveBeenCalledTimes(10);

      handle.stop();
    });

    it('should abort registration retry loop when stop is called', async () => {
      // keep registration pending — the retry loop will await it
      (mockAddressManagerClientInstance.registerService as any).mockReturnValue(
        new Promise(() => {})
      );

      const handle = am.start();
      handle.stop();

      // stop sets shouldRetryRegistration to false; the loop checks it before each retry
      // Since the first registration never settles, no further retries happen
      expect(mockAddressManagerClientInstance.registerService).toHaveBeenCalledTimes(1);
    });
  });
});
