import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('node:fs/promises', () => ({
  access: jest.fn(),
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

jest.mock('@trading-model/certificate-utils/async', () => ({
  generateKeyPairAsync: jest.fn(),
  createCsrAsync: jest.fn(),
}));

jest.mock('@trading-model/certificate-utils/generate-key-pair', () => ({
  KeyAlgorithm: { EC_P384: 'ec-p384' },
}));

const mockSignCertificate = jest.fn();
jest.mock('@trading-model/common/ca/ca-client', () => ({
  CaClient: jest.fn(() => ({
    signCertificate: mockSignCertificate,
  })),
}));

jest.mock('@trading-model/common/config/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockCertificateClientInstance = {
  startAutoRenew: jest.fn(),
  obtainCertificate: jest.fn(),
  stopAutoRenew: jest.fn(),
  getCurrentCert: jest.fn(),
};
const mockCertificateClient = jest.fn(() => mockCertificateClientInstance);
jest.mock('../../src/certificate-client', () => ({
  CertificateClient: mockCertificateClient,
}));

const mockApp = { use: jest.fn() };
const mockConfigureApp = jest.fn((...args: any[]) => mockApp);
jest.mock('@trading-model/common/server/configure-app', () => ({
  configureApp: mockConfigureApp,
}));

const mockMTLSAuthMiddleware = jest.fn();
jest.mock('@trading-model/common/middleware/mtls-auth', () => ({
  MTLSAuthMiddleware: mockMTLSAuthMiddleware,
}));

const mockResponseProtocol = jest.fn();
jest.mock('@trading-model/common/middleware/response-protocol', () => ({
  ResponseProtocol: mockResponseProtocol,
}));

const mockHttpsServer = { raw: { setSecureContext: jest.fn() } };
const mockCreateAndStartHttpsServer = jest.fn((...args: any[]) => Promise.resolve(mockHttpsServer));
jest.mock('@trading-model/common/server/server-factory', () => ({
  createAndStartHttpsServer: mockCreateAndStartHttpsServer,
}));

import fs from 'node:fs/promises';
import {
  generateKeyPairAsync,
  createCsrAsync,
} from '@trading-model/certificate-utils/async';
import {
  bootstrapConfigFromEnv,
  bootstrapFromEnv,
  bootstrapCertificate,
  createTlsBootstrap,
  createHttpsServer,
} from '../../src/certificate-bootstrap';
import { logger } from '@trading-model/common/config/logger';

function mockResolved<T>(mock: unknown, value: T): void {
  (mock as any).mockResolvedValue(value);
}

function mockRejected(mock: unknown, error: Error): void {
  (mock as any).mockRejectedValue(error);
}

describe('bootstrapConfigFromEnv', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when CERT_CLIENT_CA_URL is not set', () => {
    const result = bootstrapConfigFromEnv({});
    expect(result).toBeNull();
  });

  it('should return config when CERT_CLIENT_CA_URL is set', () => {
    const result = bootstrapConfigFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
      CERT_CLIENT_SERVICE_ID: 'my-service',
      CERT_CLIENT_COMMON_NAME: 'my-common-name',
      CERT_CLIENT_SANS: 'svc1,svc2,localhost',
    });
    expect(result!.caUrl).toBe('https://ca:8447');
    expect(result!.serviceId).toBe('my-service');
    expect(result!.commonName).toBe('my-common-name');
    expect(result!.san).toEqual(['svc1', 'svc2', 'localhost']);
  });

  it('should fall back to APP_NAME for serviceId', () => {
    const result = bootstrapConfigFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
      APP_NAME: 'my-app',
    });
    expect(result!.serviceId).toBe('my-app');
  });

  it('should default to unknown when no serviceId source exists', () => {
    const result = bootstrapConfigFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
    });
    expect(result!.serviceId).toBe('unknown');
  });

  it('should use serviceId as default commonName', () => {
    const result = bootstrapConfigFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
      CERT_CLIENT_SERVICE_ID: 'my-service',
    });
    expect(result!.commonName).toBe('my-service');
  });

  it('should use default TLS paths', () => {
    const result = bootstrapConfigFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
    });
    expect(result!.certPath).toBe('/etc/tls/cert.pem');
    expect(result!.keyPath).toBe('/etc/tls/key.pem');
    expect(result!.caPath).toBe('/etc/tls/ca.pem');
  });

  it('should use TLS paths from env', () => {
    const result = bootstrapConfigFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
      TLS_CERT_PATH: '/custom/cert.pem',
      TLS_KEY_PATH: '/custom/key.pem',
      TLS_CA_PATH: '/custom/ca.pem',
    });
    expect(result!.certPath).toBe('/custom/cert.pem');
    expect(result!.keyPath).toBe('/custom/key.pem');
    expect(result!.caPath).toBe('/custom/ca.pem');
  });

  it('should configure mTLS when CA_CLIENT_TLS_KEY is provided', () => {
    const result = bootstrapConfigFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
      CA_CLIENT_TLS_KEY: 'key-content',
      CA_CLIENT_TLS_CERT: 'cert-content',
      CA_CLIENT_TLS_CA: 'ca-content',
    });
    expect(result!.tls).toEqual({
      key: 'key-content',
      cert: 'cert-content',
      ca: 'ca-content',
    });
  });

  it('should not configure mTLS when CA_CLIENT_TLS_KEY is missing', () => {
    const result = bootstrapConfigFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
    });
    expect(result!.tls).toBeUndefined();
  });

  it('should default mTLS cert and ca to empty when only key is set', () => {
    const result = bootstrapConfigFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
      CA_CLIENT_TLS_KEY: 'key-content',
    });
    expect(result!.tls).toEqual({
      key: 'key-content',
      cert: '',
      ca: '',
    });
  });

  it('should pass bootstrapToken when set', () => {
    const result = bootstrapConfigFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
      CERT_CLIENT_BOOTSTRAP_TOKEN: 'my-token',
    });
    expect(result!.bootstrapToken).toBe('my-token');
  });
});

describe('bootstrapFromEnv', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should do nothing when CERT_CLIENT_CA_URL is not set', async () => {
    await bootstrapFromEnv({});
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should bootstrap when CERT_CLIENT_CA_URL is set', async () => {
    mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
    mockResolved(createCsrAsync, 'csr');
    mockResolved(mockSignCertificate, {
      cert: 'cert',
      caPem: 'ca',
      serialNumber: 'sn',
      expiresAt: new Date('2027-01-01').toISOString(),
    });
    mockRejected(fs.access, new Error('ENOENT'));

    await bootstrapFromEnv({
      CERT_CLIENT_CA_URL: 'https://ca:8447',
      CERT_CLIENT_SERVICE_ID: 'my-service',
    });

    expect(generateKeyPairAsync).toHaveBeenCalled();
    expect(createCsrAsync).toHaveBeenCalled();
    expect(mockSignCertificate).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledTimes(3);
  });
});

describe('bootstrapCertificate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should skip bootstrap when cert and key already exist', async () => {
    mockResolved(fs.access, undefined);

    await bootstrapCertificate({
      caUrl: 'https://ca:8447',
      serviceId: 'svc',
      commonName: 'svc',
      san: ['svc'],
      certPath: '/etc/tls/cert.pem',
      keyPath: '/etc/tls/key.pem',
      caPath: '/etc/tls/ca.pem',
    });

    expect(generateKeyPairAsync).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should bootstrap when cert and key do not exist', async () => {
    mockRejected(fs.access, new Error('ENOENT'));
    mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
    mockResolved(createCsrAsync, 'csr');
    mockResolved(mockSignCertificate, {
      cert: 'cert',
      caPem: 'ca',
      serialNumber: 'sn',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });

    await bootstrapCertificate({
      caUrl: 'https://ca:8447',
      serviceId: 'svc',
      commonName: 'svc',
      san: ['svc'],
      certPath: '/etc/tls/cert.pem',
      keyPath: '/etc/tls/key.pem',
      caPath: '/etc/tls/ca.pem',
    });

    expect(generateKeyPairAsync).toHaveBeenCalled();
    expect(createCsrAsync).toHaveBeenCalled();
    expect(fs.writeFile).toHaveBeenCalledTimes(3);
    expect(fs.writeFile).toHaveBeenCalledWith('/etc/tls/key.pem', 'pk', { mode: 0o600 });
    expect(fs.writeFile).toHaveBeenCalledWith('/etc/tls/cert.pem', 'cert', { mode: 0o644 });
    expect(fs.writeFile).toHaveBeenCalledWith('/etc/tls/ca.pem', 'ca', { mode: 0o644 });
  });

  it('should pass bootstrapToken to signCertificate', async () => {
    mockRejected(fs.access, new Error('ENOENT'));
    mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
    mockResolved(createCsrAsync, 'csr');
    mockResolved(mockSignCertificate, {
      cert: 'cert',
      caPem: 'ca',
      serialNumber: 'sn',
      expiresAt: '2027-01-01T00:00:00.000Z',
    });

    await bootstrapCertificate({
      caUrl: 'https://ca:8447',
      serviceId: 'svc',
      commonName: 'svc',
      san: ['svc'],
      certPath: '/etc/tls/cert.pem',
      keyPath: '/etc/tls/key.pem',
      caPath: '/etc/tls/ca.pem',
      bootstrapToken: 'btoken',
    });

    expect(mockSignCertificate).toHaveBeenCalledWith('svc', 'csr', {
      bootstrapToken: 'btoken',
    });
  });
});

describe('createTlsBootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when CERT_CLIENT_CA_URL is not set', () => {
    const result = createTlsBootstrap({});
    expect(result).toBeNull();
  });

  it('should return TlsBootstrapOptions with ensure and setupAutoRenew when configured', () => {
    const result = createTlsBootstrap({ CERT_CLIENT_CA_URL: 'https://ca:8447' });
    expect(result).not.toBeNull();
    expect(typeof (result as any).ensure).toBe('function');
    expect(typeof (result as any).setupAutoRenew).toBe('function');
  });

  it('ensure should call bootstrapCertificate with the resolved config', async () => {
    mockResolved(fs.access, undefined);

    const result = createTlsBootstrap({ CERT_CLIENT_CA_URL: 'https://ca:8447' });
    await (result as any).ensure();

    expect(fs.access).toHaveBeenCalledWith('/etc/tls/cert.pem');
    expect(fs.access).toHaveBeenCalledWith('/etc/tls/key.pem');
  });

  it('setupAutoRenew should create CertificateClient and schedule startAutoRenew after 1s', () => {
    jest.useFakeTimers();
    const server = { setSecureContext: jest.fn() };

    const result = createTlsBootstrap({ CERT_CLIENT_CA_URL: 'https://ca:8447' });
    (result as any).setupAutoRenew(server);

    expect(mockCertificateClient).toHaveBeenCalledTimes(1);
    const configArg = (mockCertificateClient as any).mock.calls[0][0] as any;
    expect(configArg.caUrl).toBe('https://ca:8447');
    expect(configArg.serviceId).toBe('unknown');
    expect(typeof configArg.onRenew).toBe('function');

    jest.advanceTimersByTime(1000);
    expect(mockCertificateClientInstance.startAutoRenew).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('setupAutoRenew onRenew should call setSecureContext and log on success', () => {
    const server = { setSecureContext: jest.fn() };

    const result = createTlsBootstrap({ CERT_CLIENT_CA_URL: 'https://ca:8447' });
    (result as any).setupAutoRenew(server);

    const { onRenew } = (mockCertificateClient as any).mock.calls[0][0] as any;
    onRenew({ keyPem: 'key', certPem: 'cert', caPem: 'ca' });

    expect(server.setSecureContext).toHaveBeenCalledWith({ key: 'key', cert: 'cert', ca: 'ca' });
    expect(logger.info).toHaveBeenCalledWith('TLS context hot-reloaded after certificate renewal');
  });

  it('setupAutoRenew onRenew should log error when setSecureContext throws', () => {
    const server = { setSecureContext: jest.fn(() => { throw new Error('boom'); }) };

    const result = createTlsBootstrap({ CERT_CLIENT_CA_URL: 'https://ca:8447' });
    (result as any).setupAutoRenew(server);

    const { onRenew } = (mockCertificateClient as any).mock.calls[0][0] as any;
    onRenew({ keyPem: 'key', certPem: 'cert', caPem: 'ca' });

    expect(logger.error).toHaveBeenCalledWith('Failed to hot-reload TLS context', { err: expect.any(Error) });
  });
});

describe('createHttpsServer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should create server with provided TLS when env has no CA_URL', async () => {
    const routes = jest.fn();
    const onServerReady = jest.fn();
    const tls = { key: '/key.pem', cert: '/cert.pem', ca: '/ca.pem' };

    const result = await createHttpsServer({
      port: 443,
      tls,
      routes,
      onServerReady,
    } as any);

    expect(mockConfigureApp).toHaveBeenCalledWith({
      rateLimit: undefined,
      trustProxy: undefined,
    });
    expect(mockApp.use).toHaveBeenCalledWith(mockMTLSAuthMiddleware);
    expect(mockApp.use).toHaveBeenCalledWith(mockResponseProtocol);
    expect(routes).toHaveBeenCalledWith(mockApp);
    expect(mockCreateAndStartHttpsServer).toHaveBeenCalledWith(mockApp, {
      port: 443,
      tls,
      watchTls: true,
    });
    expect(onServerReady).toHaveBeenCalledWith(mockHttpsServer.raw);
    expect(mockCertificateClient).not.toHaveBeenCalled();
    expect(result).toBe(mockHttpsServer);
  });

  it('should bootstrap TLS from env and set up auto-renew CertificateClient', async () => {
    mockResolved(fs.access, undefined);
    const routes = jest.fn();
    const tls = { key: '/fallback.pem', cert: '/fallback.pem', ca: '/fallback.pem' };

    const result = await createHttpsServer({
      port: 8443,
      tls,
      routes,
      env: { CERT_CLIENT_CA_URL: 'https://ca:8447' },
    } as any);

    expect(fs.access).toHaveBeenCalled();
    expect(mockCreateAndStartHttpsServer).toHaveBeenCalledWith(mockApp, {
      port: 8443,
      tls: { key: '/etc/tls/key.pem', cert: '/etc/tls/cert.pem', ca: '/etc/tls/ca.pem' },
      watchTls: true,
    });

    expect(mockCertificateClient).toHaveBeenCalledTimes(1);
    const configArg = (mockCertificateClient as any).mock.calls[0][0] as any;
    expect(configArg.caUrl).toBe('https://ca:8447');
    expect(typeof configArg.onRenew).toBe('function');
    expect(result).toBe(mockHttpsServer);
  });

  it('onRenew should call server.raw.setSecureContext', async () => {
    mockResolved(fs.access, undefined);
    const routes = jest.fn();

    await createHttpsServer({
      port: 8443,
      tls: { key: '/k.pem', cert: '/c.pem', ca: '/ca.pem' },
      routes,
      env: { CERT_CLIENT_CA_URL: 'https://ca:8447' },
    } as any);

    const { onRenew } = (mockCertificateClient as any).mock.calls[0][0] as any;
    onRenew({ keyPem: 'key', certPem: 'cert', caPem: 'ca' });

    expect(mockHttpsServer.raw.setSecureContext).toHaveBeenCalledWith({ key: 'key', cert: 'cert', ca: 'ca' });
  });

  it('should schedule startAutoRenew via setTimeout when env config present', async () => {
    jest.useFakeTimers();
    mockResolved(fs.access, undefined);
    const routes = jest.fn();

    await createHttpsServer({
      port: 8443,
      tls: { key: '/k.pem', cert: '/c.pem', ca: '/ca.pem' },
      routes,
      env: { CERT_CLIENT_CA_URL: 'https://ca:8447' },
    } as any);

    expect(mockCertificateClientInstance.startAutoRenew).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    expect(mockCertificateClientInstance.startAutoRenew).toHaveBeenCalledTimes(1);

    jest.useRealTimers();
  });

  it('should pass watchTls false and trustProxy true when specified', async () => {
    const routes = jest.fn();
    const tls = { key: '/k.pem', cert: '/c.pem', ca: '/ca.pem' };

    await createHttpsServer({
      port: 443,
      tls,
      routes,
      watchTls: false,
      trustProxy: true,
    } as any);

    expect(mockConfigureApp).toHaveBeenCalledWith({
      rateLimit: undefined,
      trustProxy: true,
    });
    expect(mockCreateAndStartHttpsServer).toHaveBeenCalledWith(mockApp, {
      port: 443,
      tls,
      watchTls: false,
    });
  });
});
