import { describe, it, expect, jest } from '@jest/globals';

let mockApp: any;
let pingHandler: any;

jest.mock('express', () => {
  mockApp = {
    use: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    get: jest.fn((path: string, handler: any) => {
      if (path === '/ping') pingHandler = handler;
      return mockApp;
    }),
  };
  const expressFn: any = jest.fn(() => mockApp);
  expressFn.json = jest.fn(() => 'jsonParser');
  expressFn.urlencoded = jest.fn(() => 'urlencodedParser');
  expressFn.Router = jest.fn(() => ({ use: jest.fn().mockReturnThis() }));
  return expressFn;
});

jest.mock('helmet', () => jest.fn(() => 'helmetMiddleware'));

jest.mock('express-rate-limit', () => ({
  rateLimit: jest.fn(() => 'rateLimitMiddleware'),
}));

let mockHttpsServer: any;

jest.mock('node:https', () => ({
  createServer: jest.fn((_options: any, _app: any) => {
    mockHttpsServer = {
      listen: jest.fn((_port: number, cb: () => void) => cb()),
      close: jest.fn((cb: (err?: Error) => void) => cb && cb()),
    };
    return mockHttpsServer;
  }),
}));

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(() => Promise.resolve('mock-cert-content')),
}));

jest.mock('../../src/middleware/response-protocol', () => ({
  ResponseProtocol: 'responseProtocolMiddleware',
}));

jest.mock('../../src/middleware/mtls-auth', () => ({
  MTLSAuthMiddleware: 'mtlsAuthMiddleware',
}));

jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  _private: class {},
}));

import { createSecureServer } from '../../src/server/create-secure-server';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import https from 'node:https';
import fs from 'node:fs/promises';

 

describe('createSecureServer', () => {
  const defaultOptions = {
    port: 8443,
    tls: {
      key: '/path/to/key.pem',
      cert: '/path/to/cert.pem',
      ca: '/path/to/ca.pem',
    },
    routes: jest.fn(),
  };

  it('should create express app and configure middleware', async () => {
    await createSecureServer(defaultOptions);

    expect(express).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledWith(helmet());
    expect(mockApp.get).toHaveBeenCalledWith('/ping', expect.any(Function));
    expect(mockApp.use).toHaveBeenCalledWith('jsonParser');
    expect(mockApp.use).toHaveBeenCalledWith('urlencodedParser');
    expect(mockApp.use).toHaveBeenCalledWith('rateLimitMiddleware');
    expect(mockApp.use).toHaveBeenCalledWith('mtlsAuthMiddleware');
    expect(mockApp.use).toHaveBeenCalledWith('responseProtocolMiddleware');
    expect(defaultOptions.routes).toHaveBeenCalledWith(mockApp);
  });

  it('should set trust proxy when trustProxy is not false', async () => {
    mockApp.set.mockClear();

    await createSecureServer({ ...defaultOptions, trustProxy: true });
    expect(mockApp.set).toHaveBeenCalledWith('trust proxy', 'loopback');
  });

  it('should not set trust proxy when trustProxy is false', async () => {
    mockApp.set.mockClear();

    await createSecureServer({ ...defaultOptions, trustProxy: false });
    expect(mockApp.set).not.toHaveBeenCalled();
  });

  it('should read TLS files and create HTTPS server', async () => {
    await createSecureServer(defaultOptions);

    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('key.pem'),
      expect.any(String)
    );
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining('cert.pem'),
      expect.any(String)
    );
    expect(fs.readFile).toHaveBeenCalledWith(expect.stringContaining('ca.pem'), expect.any(String));
    expect(https.createServer).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'mock-cert-content',
        cert: 'mock-cert-content',
        ca: 'mock-cert-content',
        requestCert: true,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.3',
      }),
      expect.anything()
    );
  });

  it('should start listening on the specified port', async () => {
    mockHttpsServer.listen.mockClear();

    await createSecureServer(defaultOptions);
    expect(mockHttpsServer.listen).toHaveBeenCalledWith(8443, expect.any(Function));
  });

  it('should return HttpServer with close method', async () => {
    const server = await createSecureServer(defaultOptions);
    expect(server).toHaveProperty('close');
  });

  it('should close the HTTPS server when close is called', async () => {
    await createSecureServer(defaultOptions);
    mockHttpsServer.close.mockClear();

    const server = await createSecureServer(defaultOptions);
    await server.close();
    expect(mockHttpsServer.close).toHaveBeenCalled();
  });

  it('should reject when HTTPS server close returns an error', async () => {
    const server = await createSecureServer(defaultOptions);
    mockHttpsServer.close.mockImplementationOnce((cb: (err: Error | undefined) => void) => {
      cb(new Error('close error'));
    });
    await expect(server.close()).rejects.toThrow('close error');
  });

  it('should respond with ok status on GET /ping', async () => {
    await createSecureServer(defaultOptions);

    const mockRes = {
      json: jest.fn(),
    };
    pingHandler({} as any, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith({ status: 'ok' });
  });

  it('should apply custom rate limit config', async () => {
    await createSecureServer({
      ...defaultOptions,
      rateLimit: { windowMs: 60000, limit: 50 },
    });

    expect(rateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        windowMs: 60000,
        limit: 50,
      })
    );
  });
});
