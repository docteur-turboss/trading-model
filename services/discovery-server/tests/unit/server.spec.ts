import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@trading-model/common/server/create-secure-server', () => ({
  createSecureServer: jest.fn(),
}));

jest.mock('../../src/routes/heartbeat.routes', () => ({
  heartbeatRoutes: jest.fn(),
}));

jest.mock('../../src/routes/register.routes', () => ({
  registryRoutes: jest.fn(),
}));

jest.mock('../../src/config/env', () => ({
  env: {
    PORT: 8443,
    TLS_KEY_PATH: '/certs/key.pem',
    TLS_CERT_PATH: '/certs/cert.pem',
    TLS_CA_PATH: '/certs/ca.pem',
  },
}));

import { createServer } from '../../src/app/server';

describe('createServer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create a secure server with full config', () => {
    const { createSecureServer } = jest.requireMock(
      '@trading-model/common/server/create-secure-server'
    ) as { createSecureServer: jest.Mock };
    const mockServer = { close: jest.fn() };
    createSecureServer.mockReturnValue(mockServer);

    const result = createServer();

    expect(createSecureServer).toHaveBeenCalledWith({
      port: 8443,
      tls: {
        key: '/certs/key.pem',
        cert: '/certs/cert.pem',
        ca: '/certs/ca.pem',
      },
      routes: expect.any(Function),
    });
    expect(result).toBe(mockServer);
  });

  it('should register heartbeat and registry routes', () => {
    const { createSecureServer } = jest.requireMock(
      '@trading-model/common/server/create-secure-server'
    ) as { createSecureServer: jest.Mock };
    const { heartbeatRoutes } = jest.requireMock('../../src/routes/heartbeat.routes') as {
      heartbeatRoutes: jest.Mock;
    };
    const { registryRoutes } = jest.requireMock('../../src/routes/register.routes') as {
      registryRoutes: jest.Mock;
    };

    const app = { use: jest.fn() };
    createSecureServer.mockImplementation(((opts: {
      routes: (app: { use: jest.Mock }) => void;
    }) => {
      opts.routes(app);
      return { close: jest.fn() };
    }) as unknown as (...args: unknown[]) => unknown);

    const hrRouter = { post: jest.fn() };
    const rrRouter = { post: jest.fn(), get: jest.fn() };
    heartbeatRoutes.mockReturnValue(hrRouter);
    registryRoutes.mockReturnValue(rrRouter);

    createServer();

    expect(app.use).toHaveBeenCalledWith('/', rrRouter);
    expect(app.use).toHaveBeenCalledWith('/', hrRouter);
  });
});
