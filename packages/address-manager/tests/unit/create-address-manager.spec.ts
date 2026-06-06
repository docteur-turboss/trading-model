import { describe, it, expect, jest } from '@jest/globals';

const mockAddressManagerInstance = {
  getToken: jest.fn(),
  start: jest.fn(() => ({ stop: jest.fn() })),
  findService: jest.fn(),
  listenExpress: jest.fn(),
};

jest.mock('../../src/index', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockAddressManagerInstance),
}));

import { createAddressManager } from '../../src/create-address-manager';

describe('createAddressManager', () => {
  it('should create an AddressManager with the given env', () => {
    const env = {
      ADDRESS_MANAGER_URL: 'http://localhost:8443',
      CACHE_TTL_MS: 60000,
      INSTANCE_ID: 'instance-1',
      SERVICE_NAME: 'test-service',
      SERVICE_PING_TIMEOUT_MS: 2000,
      PORT: 8080,
      TOKEN_REFRESH_INTERVAL_MS: 300000,
      TTL_REFRESH_INTERVAL_MS: 300000,
      TLS_CERT_PATH: '/path/to/cert.pem',
      TLS_KEY_PATH: '/path/to/key.pem',
      TLS_CA_PATH: '/path/to/ca.pem',
    } as any;

    const am = createAddressManager(env);

    expect(am).toBe(mockAddressManagerInstance);
  });

  it('should parse DNS_NAME_MAP when provided', () => {
    const env = {
      ADDRESS_MANAGER_URL: 'http://localhost:8443',
      CACHE_TTL_MS: 60000,
      INSTANCE_ID: 'instance-1',
      SERVICE_NAME: 'test-service',
      SERVICE_PING_TIMEOUT_MS: 2000,
      PORT: 8080,
      TOKEN_REFRESH_INTERVAL_MS: 300000,
      TTL_REFRESH_INTERVAL_MS: 300000,
      TLS_CERT_PATH: '/path/to/cert.pem',
      TLS_KEY_PATH: '/path/to/key.pem',
      TLS_CA_PATH: '/path/to/ca.pem',
      DNS_NAME_MAP: { 'discovery-service': 'discovery-server' },
    } as any;

    const am = createAddressManager(env);

    expect(am).toBe(mockAddressManagerInstance);
  });
});
