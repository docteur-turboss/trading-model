import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@trading-model/common/server/create-secure-server', () => ({
  createSecureServer: jest.fn(),
}));

jest.mock('@trading-model/common/server/load-tls-config', () => ({
  loadTlsConfig: jest.fn().mockReturnValue({ key: 'key.pem', cert: 'cert.pem', ca: 'ca.pem' }),
}));

jest.mock('../../src/config/env', () => ({
  env: {
    PORT: 9443,
    TLS_KEY_PATH: '/key.pem',
    TLS_CERT_PATH: '/cert.pem',
    TLS_CA_PATH: '/ca.pem',
  },
}));

jest.mock('../../src/routes/crypto.routes', () => ({
  cryptoRoutes: jest.fn(),
}));

import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';
import { cryptoRoutes } from '../../src/routes/crypto.routes';
import { createServer } from '../../src/app/server';

describe('createServer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a secure server with TLS and crypto routes', () => {
    const mockServer = { close: jest.fn() };
    (createSecureServer as jest.Mock).mockImplementation((opts: any) => {
      const app = { use: jest.fn() };
      opts.routes(app);
      return mockServer;
    });

    const cryptoRouter = { post: jest.fn() };
    (cryptoRoutes as jest.Mock).mockReturnValue(cryptoRouter);

    const result = createServer();

    expect(loadTlsConfig).toHaveBeenCalled();
    expect(createSecureServer).toHaveBeenCalledWith({
      port: 9443,
      tls: { key: 'key.pem', cert: 'cert.pem', ca: 'ca.pem' },
      routes: expect.any(Function),
    });
    expect(result).toBe(mockServer);
  });

  it('should register crypto routes at /api/v1/crypto', () => {
    const app = { use: jest.fn() };
    (createSecureServer as jest.Mock).mockImplementation((opts: any) => {
      opts.routes(app);
      return { close: jest.fn() };
    });

    const cryptoRouter = { post: jest.fn() };
    (cryptoRoutes as jest.Mock).mockReturnValue(cryptoRouter);

    createServer();

    expect(app.use).toHaveBeenCalledWith('/api/v1/crypto', cryptoRouter);
  });
});
