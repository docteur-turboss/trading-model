import { describe, it, expect, jest } from '@jest/globals';

const mockApp = { use: jest.fn() };
const mockCreateSecureServer = jest.fn<any>().mockReturnValue({ close: jest.fn() });

jest.mock('@trading-model/common/server/create-secure-server', () => ({
  createSecureServer: mockCreateSecureServer,
}));

jest.mock('../../../src/config/message-manager', () => ({
  MessageManagerListenExpress: jest.fn(),
}));

jest.mock('../../../src/config/address-manager', () => ({
  AddressManagerRoutes: jest.fn((app: any) => app),
}));

jest.mock('../../../src/clients/http/routes', () => ({
  FinancialRoutes: jest.fn(() => mockApp),
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    PORT: 3000,
    TLS_KEY_PATH: '/etc/tls/key.pem',
    TLS_CERT_PATH: '/etc/tls/cert.pem',
    TLS_CA_PATH: '/etc/tls/ca.pem',
  },
}));

import { createServer } from '../../../src/app/server';

describe('app/server', () => {
  it('should create server', () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(server.close).toBeDefined();
  });

  it('should call createSecureServer with correct options', () => {
    createServer();
    expect(mockCreateSecureServer).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 3000,
        tls: expect.objectContaining({
          key: '/etc/tls/key.pem',
          cert: '/etc/tls/cert.pem',
          ca: '/etc/tls/ca.pem',
        }),
        rateLimit: { windowMs: 900000, limit: 100 },
      })
    );
  });

  it('should register routes callback', () => {
    createServer();
    const options: any = mockCreateSecureServer.mock.calls[0][0];
    expect(typeof options.routes).toBe('function');
    expect(() => options.routes(mockApp)).not.toThrow();
  });
});
