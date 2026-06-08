import { describe, it, expect, jest } from '@jest/globals';

import BrokerModule from '../../../src/messaging/index';

jest.mock('@trading-model/common/config/http-client', () => {
  const mockInstance = { post: jest.fn(), get: jest.fn() };
  const MockHttpClient = jest.fn().mockImplementation(() => mockInstance);
  MockHttpClient.createWithTls = jest.fn(() => mockInstance);
  return { HttpClient: MockHttpClient };
});

describe('BrokerModule', () => {
  it('should construct without error', () => {
    const module = new BrokerModule({
      RootCACertPath: '/certs/ca.pem',
      CertificatPath: '/certs/cert.pem',
      KeyCertificatPath: '/certs/key.pem',
    });

    expect(module).toBeDefined();
  });

  it('should expose a listen method', () => {
    const module = new BrokerModule({
      RootCACertPath: '/certs/ca.pem',
      CertificatPath: '/certs/cert.pem',
      KeyCertificatPath: '/certs/key.pem',
    });

    expect(module.listen).toBeDefined();
    expect(typeof module.listen).toBe('function');
  });

  it('should accept an Express app in listen method', () => {
    const module = new BrokerModule({
      RootCACertPath: '/certs/ca.pem',
      CertificatPath: '/certs/cert.pem',
      KeyCertificatPath: '/certs/key.pem',
    });

    const mockApp = { use: jest.fn() };
    module.listen(mockApp as never);

    expect(mockApp.use).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledTimes(1);
  });
});
