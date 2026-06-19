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
      DISCOVERY_TIMEOUT_MS: 5000,
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
      DISCOVERY_TIMEOUT_MS: 5000,
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

  it('should parse ADDRESS_MANAGER_URLS when provided as valid JSON', () => {
    const env = {
      ADDRESS_MANAGER_URL: 'http://fallback:8443',
      ADDRESS_MANAGER_URLS: '["http://ds1:3000","http://ds2:3000"]',
      CACHE_TTL_MS: 60000,
      DISCOVERY_TIMEOUT_MS: 5000,
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

    createAddressManager(env);
  });

  it('should fall back to single URL when ADDRESS_MANAGER_URLS has invalid JSON', () => {
    const env = {
      ADDRESS_MANAGER_URL: 'http://fallback:8443',
      ADDRESS_MANAGER_URLS: 'not-json',
      CACHE_TTL_MS: 60000,
      DISCOVERY_TIMEOUT_MS: 5000,
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

    createAddressManager(env);
  });

  it('should parse WS_SUBSCRIBED_SERVICES when provided as valid JSON', () => {
    const env = {
      ADDRESS_MANAGER_URL: 'http://localhost:8443',
      CACHE_TTL_MS: 60000,
      DISCOVERY_TIMEOUT_MS: 5000,
      INSTANCE_ID: 'instance-1',
      SERVICE_NAME: 'test-service',
      SERVICE_PING_TIMEOUT_MS: 2000,
      PORT: 8080,
      TOKEN_REFRESH_INTERVAL_MS: 300000,
      TTL_REFRESH_INTERVAL_MS: 300000,
      TLS_CERT_PATH: '/path/to/cert.pem',
      TLS_KEY_PATH: '/path/to/key.pem',
      TLS_CA_PATH: '/path/to/ca.pem',
      WS_SUBSCRIBED_SERVICES: '["service-a","service-b"]',
    } as any;

    createAddressManager(env);
  });

  it('should handle invalid WS_SUBSCRIBED_SERVICES JSON gracefully', () => {
    const env = {
      ADDRESS_MANAGER_URL: 'http://localhost:8443',
      CACHE_TTL_MS: 60000,
      DISCOVERY_TIMEOUT_MS: 5000,
      INSTANCE_ID: 'instance-1',
      SERVICE_NAME: 'test-service',
      SERVICE_PING_TIMEOUT_MS: 2000,
      PORT: 8080,
      TOKEN_REFRESH_INTERVAL_MS: 300000,
      TTL_REFRESH_INTERVAL_MS: 300000,
      TLS_CERT_PATH: '/path/to/cert.pem',
      TLS_KEY_PATH: '/path/to/key.pem',
      TLS_CA_PATH: '/path/to/ca.pem',
      WS_SUBSCRIBED_SERVICES: 'not-json',
    } as any;

    createAddressManager(env);
  });

  it('should handle empty WS_SUBSCRIBED_SERVICES array', () => {
    const env = {
      ADDRESS_MANAGER_URL: 'http://localhost:8443',
      CACHE_TTL_MS: 60000,
      DISCOVERY_TIMEOUT_MS: 5000,
      INSTANCE_ID: 'instance-1',
      SERVICE_NAME: 'test-service',
      SERVICE_PING_TIMEOUT_MS: 2000,
      PORT: 8080,
      TOKEN_REFRESH_INTERVAL_MS: 300000,
      TTL_REFRESH_INTERVAL_MS: 300000,
      TLS_CERT_PATH: '/path/to/cert.pem',
      TLS_KEY_PATH: '/path/to/key.pem',
      TLS_CA_PATH: '/path/to/ca.pem',
      WS_SUBSCRIBED_SERVICES: '[]',
    } as any;

    createAddressManager(env);
  });

  it('should handle WS_SUBSCRIBED_SERVICES with non-array JSON', () => {
    const env = {
      ADDRESS_MANAGER_URL: 'http://localhost:8443',
      CACHE_TTL_MS: 60000,
      DISCOVERY_TIMEOUT_MS: 5000,
      INSTANCE_ID: 'instance-1',
      SERVICE_NAME: 'test-service',
      SERVICE_PING_TIMEOUT_MS: 2000,
      PORT: 8080,
      TOKEN_REFRESH_INTERVAL_MS: 300000,
      TTL_REFRESH_INTERVAL_MS: 300000,
      TLS_CERT_PATH: '/path/to/cert.pem',
      TLS_KEY_PATH: '/path/to/key.pem',
      TLS_CA_PATH: '/path/to/ca.pem',
      WS_SUBSCRIBED_SERVICES: '{"key": "value"}',
    } as any;

    createAddressManager(env);
  });

  it('should fall back to single URL when ADDRESS_MANAGER_URLS is empty array', () => {
    const env = {
      ADDRESS_MANAGER_URL: 'http://fallback:8443',
      ADDRESS_MANAGER_URLS: '[]',
      CACHE_TTL_MS: 60000,
      DISCOVERY_TIMEOUT_MS: 5000,
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

    createAddressManager(env);
  });

  it('should fall back to single URL when ADDRESS_MANAGER_URLS is non-array JSON', () => {
    const env = {
      ADDRESS_MANAGER_URL: 'http://fallback:8443',
      ADDRESS_MANAGER_URLS: '{"key": "value"}',
      CACHE_TTL_MS: 60000,
      DISCOVERY_TIMEOUT_MS: 5000,
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

    createAddressManager(env);
  });
});
