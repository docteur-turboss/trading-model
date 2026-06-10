import { describe, it, expect, jest } from '@jest/globals';

const mockAddressManager = {
  start: jest.fn(),
  listenExpress: jest.fn(),
};

jest.mock('@trading-model/address-manager/create-address-manager', () => ({
  createAddressManager: jest.fn(() => mockAddressManager),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    PORT: 3000,
    TLS_KEY_PATH: '/some/key.pem',
    TLS_CERT_PATH: '/some/cert.pem',
    TLS_CA_PATH: '/some/ca.pem',
    APP_NAME: 'job-scheduler',
    SERVICE_NAME: 'jobs',
    INSTANCE_ID: 'instance-1',
    ADDRESS_MANAGER_URL: 'https://address-manager:3000',
    CACHE_TTL_MS: 30000,
    SERVICE_PING_TIMEOUT_MS: 2000,
    DISCOVERY_TIMEOUT_MS: 5000,
    TOKEN_REFRESH_INTERVAL_MS: 60000,
    TTL_REFRESH_INTERVAL_MS: 15000,
    MONGODB_URI: 'mongodb://localhost:27017/job-scheduler',
    MAX_QUEUE_DEPTH: 10000,
    MAX_WORKER_LOAD_RATIO: 0.85,
    ACK_TIMEOUT_MS: 30000,
    MAX_RETRIES_PER_JOB: 3,
    ORPHAN_SCAN_INTERVAL_MS: 10000,
    WORKER_HEARTBEAT_TTL_MS: 30000,
  },
}));

describe('address-manager config', () => {
  it('should export AddressManagerRoutes, bootstrapAddressManager, and AddressManager', () => {
    const addressManagerModule = require('../../../src/config/address-manager');

    expect(addressManagerModule.AddressManagerRoutes).toBeDefined();
    expect(addressManagerModule.AddressManagerRoutes).toBe(mockAddressManager.listenExpress);
    expect(addressManagerModule.bootstrapAddressManager).toBeDefined();
    expect(addressManagerModule.bootstrapAddressManager).toBe(mockAddressManager.start);
    expect(addressManagerModule.AddressManager).toBeDefined();
    expect(addressManagerModule.AddressManager).toBe(mockAddressManager);
  });
});
