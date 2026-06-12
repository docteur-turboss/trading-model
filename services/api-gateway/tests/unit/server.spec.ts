import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockTlsConfig = { key: '/certs/key.pem', cert: '/certs/cert.pem', ca: '/certs/ca.pem' };

jest.mock('@trading-model/common/server/create-secure-server', () => ({
  createSecureServer: jest
    .fn()
    .mockImplementation((opts: { port: number; tls: unknown; routes: (app: any) => void }) => {
      opts.routes({ use: jest.fn() });
      return Promise.resolve({ close: jest.fn(), raw: {} });
    }),
}));

jest.mock('@trading-model/common/server/load-tls-config', () => ({
  loadTlsConfig: jest.fn(() => mockTlsConfig),
}));

jest.mock('../../src/config/env', () => ({
  env: {
    PORT: 3000,
    TLS_KEY_PATH: '/certs/key.pem',
    TLS_CERT_PATH: '/certs/cert.pem',
    TLS_CA_PATH: '/certs/ca.pem',
    DISCOVERY_SERVICE_URL: 'https://discovery:3000',
    AUTH_TOKEN_HEADER: 'x-api-key',
    AUTH_TOKENS: '',
    RATE_LIMIT_WINDOW_MS: 60000,
    RATE_LIMIT_MAX: 100,
    CACHE_TTL_MS: 5000,
    PROXY_TIMEOUT_MS: 5000,
  },
}));

jest.mock('../../src/core/router', () => ({
  createRouter: jest.fn(() => ({ stack: [] })),
}));

import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';
import { createServer } from '../../src/app/server';

describe('server', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call createSecureServer with port and tls config', () => {
    createServer();

    expect(createSecureServer).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 3000,
        tls: expect.objectContaining(mockTlsConfig),
      })
    );
  });

  it('should call loadTlsConfig with env', () => {
    createServer();
    expect(loadTlsConfig).toHaveBeenCalledWith(expect.any(Object));
  });
});
