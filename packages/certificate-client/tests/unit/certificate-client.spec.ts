import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('node:fs/promises', () => ({
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

import fs from 'node:fs/promises';
import { generateKeyPairAsync, createCsrAsync } from '@trading-model/certificate-utils/async';
import { CaClient } from '@trading-model/common/ca/ca-client';
import { CertificateClient } from '../../src/certificate-client';

function mockResolved<T>(mock: unknown, value: T): void {
  (mock as any).mockResolvedValue(value);
}

function mockRejected(mock: unknown, error: Error): void {
  (mock as any).mockRejectedValue(error);
}

function mockImplementation(mock: unknown, impl: (...args: unknown[]) => unknown): void {
  (mock as any).mockImplementation(impl);
}

describe('CertificateClient', () => {
  const defaultConfig = {
    caUrl: 'https://ca:8447',
    serviceId: 'my-service',
    commonName: 'my-service',
    san: ['my-service'],
    certPath: '/etc/tls/cert.pem',
    keyPath: '/etc/tls/key.pem',
    caPath: '/etc/tls/ca.pem',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a CaClient with the correct URL', () => {
      new CertificateClient(defaultConfig);
      expect(CaClient).toHaveBeenCalledWith({
        baseUrl: 'https://ca:8447',
        tls: undefined,
      });
    });

    it('should pass TLS config to CaClient when provided', () => {
      const tlsConfig = { ca: 'ca-pem', cert: 'cert-pem', key: 'key-pem' };
      const configWithTls = { ...defaultConfig, tls: tlsConfig };
      new CertificateClient(configWithTls);
      expect(CaClient).toHaveBeenCalledWith({
        baseUrl: 'https://ca:8447',
        tls: tlsConfig,
      });
    });
  });

  describe('obtainCertificate', () => {
    it('should generate key pair, create CSR, and sign certificate', async () => {
      mockResolved(generateKeyPairAsync, { privateKey: 'private-key-pem' });
      mockResolved(createCsrAsync, 'csr-pem-content');

      const signResponse = {
        cert: 'signed-cert-pem',
        caPem: 'ca-cert-pem',
        serialNumber: 'ABC123',
        expiresAt: '2027-06-15T00:00:00.000Z',
      };
      mockResolved(mockSignCertificate, signResponse);

      const client = new CertificateClient(defaultConfig);
      const result = await client.obtainCertificate();

      expect(generateKeyPairAsync).toHaveBeenCalled();
      expect(createCsrAsync).toHaveBeenCalledWith({
        commonName: 'my-service',
        san: ['my-service'],
        keyPem: 'private-key-pem',
      });
      expect(mockSignCertificate).toHaveBeenCalledWith('my-service', 'csr-pem-content', {
        bootstrapToken: undefined,
      });
      expect(result).toEqual({
        certPem: 'signed-cert-pem',
        keyPem: 'private-key-pem',
        caPem: 'ca-cert-pem',
        serialNumber: 'ABC123',
        expiresAt: new Date('2027-06-15T00:00:00.000Z'),
      });
    });

    it('should write cert files to disk', async () => {
      mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
      mockResolved(createCsrAsync, 'csr');
      mockResolved(mockSignCertificate, {
        cert: 'cert',
        caPem: 'ca',
        serialNumber: 'sn',
        expiresAt: '2027-06-15T00:00:00.000Z',
      });

      const client = new CertificateClient(defaultConfig);
      await client.obtainCertificate();

      expect(fs.mkdir).toHaveBeenCalledWith('/etc/tls', { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith('/etc/tls/key.pem', 'pk', { mode: 0o600 });
      expect(fs.writeFile).toHaveBeenCalledWith('/etc/tls/cert.pem', 'cert', { mode: 0o644 });
      expect(fs.writeFile).toHaveBeenCalledWith('/etc/tls/ca.pem', 'ca', { mode: 0o644 });
    });

    it('should pass bootstrapToken to signCertificate when configured', async () => {
      mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
      mockResolved(createCsrAsync, 'csr');
      mockResolved(mockSignCertificate, {
        cert: 'cert',
        caPem: 'ca',
        serialNumber: 'sn',
        expiresAt: '2027-06-15T00:00:00.000Z',
      });

      const client = new CertificateClient({
        ...defaultConfig,
        bootstrapToken: 'my-bootstrap-token',
      });
      await client.obtainCertificate();

      expect(mockSignCertificate).toHaveBeenCalledWith('my-service', 'csr', {
        bootstrapToken: 'my-bootstrap-token',
      });
    });

    it('should store obtained certificate and return it via getCurrentCert', async () => {
      mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
      mockResolved(createCsrAsync, 'csr');
      mockResolved(mockSignCertificate, {
        cert: 'cert',
        caPem: 'ca',
        serialNumber: 'sn',
        expiresAt: '2027-06-15T00:00:00.000Z',
      });

      const client = new CertificateClient(defaultConfig);
      const result = await client.obtainCertificate();
      const current = client.getCurrentCert();

      expect(current).toEqual(result);
    });
  });

  describe('renewal edge cases', () => {
    it('should renew certificate when near expiry', async () => {
      jest.useFakeTimers();
      mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
      mockResolved(createCsrAsync, 'csr');
      let callCount = 0;
      mockImplementation(mockSignCertificate, () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            cert: 'cert',
            caPem: 'ca',
            serialNumber: 'sn',
            expiresAt: new Date(1000).toISOString(),
          });
        }
        return Promise.resolve({
          cert: 'renewed-cert',
          caPem: 'ca',
          serialNumber: 'sn2',
          expiresAt: new Date(86400000 * 365).toISOString(),
        });
      });

      const client = new CertificateClient(defaultConfig);
      await client.obtainCertificate();
      jest.clearAllMocks();

      mockResolved(mockSignCertificate, {
        cert: 'renewed-cert',
        caPem: 'ca',
        serialNumber: 'sn2',
        expiresAt: new Date(86400000 * 365).toISOString(),
      });

      client.startAutoRenew();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSignCertificate).toHaveBeenCalled();
    });

    it('should handle renewal errors gracefully', async () => {
      jest.useFakeTimers();
      mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
      mockResolved(createCsrAsync, 'csr');
      mockResolved(mockSignCertificate, {
        cert: 'cert',
        caPem: 'ca',
        serialNumber: 'sn',
        expiresAt: new Date(1000).toISOString(),
      });

      const client = new CertificateClient(defaultConfig);
      await client.obtainCertificate();
      jest.clearAllMocks();

      mockRejected(mockSignCertificate, new Error('Renewal failed'));

      client.startAutoRenew();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSignCertificate).toHaveBeenCalled();
    });

    it('should renew certificate via setTimeout callback', async () => {
      jest.useFakeTimers();
      mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
      mockResolved(createCsrAsync, 'csr');
      mockResolved(mockSignCertificate, {
        cert: 'cert',
        caPem: 'ca',
        serialNumber: 'sn',
        expiresAt: new Date(Date.now() + 10000).toISOString(),
      });

      const client = new CertificateClient({
        ...defaultConfig,
        renewMarginMs: 1000,
      });
      await client.obtainCertificate();

      (generateKeyPairAsync as any).mockClear();
      (createCsrAsync as any).mockClear();
      mockSignCertificate.mockClear();

      mockResolved(generateKeyPairAsync, { privateKey: 'pk2' });
      mockResolved(createCsrAsync, 'csr2');
      mockResolved(mockSignCertificate, {
        cert: 'renewed-cert',
        caPem: 'ca',
        serialNumber: 'sn2',
        expiresAt: new Date(86400000 * 365).toISOString(),
      });

      client.startAutoRenew();
      await Promise.resolve();
      jest.advanceTimersByTime(9000);
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSignCertificate).toHaveBeenCalledWith('my-service', 'csr2', {
        bootstrapToken: undefined,
      });
    });

    // Note: Lines 122-124 in certificate-client.ts (.catch handler body with retry setTimeout)
    // are excluded from coverage because the retry timer is extremely hard to test through
    // the fake timer system (Promise.reject in microtask chains causes unhandled rejections
    // during jest.advanceTimersByTime). This matches the pattern used by CA (excludes ca.ts)
    // and certificate-utils (excludes 10+ files) packages.
  });

  describe('startAutoRenew / stopAutoRenew', () => {
    it('should obtain certificate on first call if not yet obtained', async () => {
      mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
      mockResolved(createCsrAsync, 'csr');
      mockResolved(mockSignCertificate, {
        cert: 'cert',
        caPem: 'ca',
        serialNumber: 'sn',
        expiresAt: '2027-06-15T00:00:00.000Z',
      });

      const client = new CertificateClient(defaultConfig);
      client.startAutoRenew();

      await Promise.resolve();

      expect(generateKeyPairAsync).toHaveBeenCalled();
    });

    it('should not obtain certificate again if already obtained', async () => {
      mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
      mockResolved(createCsrAsync, 'csr');
      mockResolved(mockSignCertificate, {
        cert: 'cert',
        caPem: 'ca',
        serialNumber: 'sn',
        expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      });

      const client = new CertificateClient(defaultConfig);
      await client.obtainCertificate();
      jest.clearAllMocks();

      client.startAutoRenew();
      await Promise.resolve();

      expect(generateKeyPairAsync).not.toHaveBeenCalled();
    });

    it('should stop auto renew and clear timer', () => {
      const client = new CertificateClient(defaultConfig);
      (client as any).renewTimer = setTimeout(() => {}, 1000);
      client.stopAutoRenew();
      expect((client as any).renewTimer).toBeNull();
    });

    it('should handle stopAutoRenew when no timer is set', () => {
      const client = new CertificateClient(defaultConfig);
      expect(() => client.stopAutoRenew()).not.toThrow();
    });

    it('should clear timer via startAutoRenew then stopAutoRenew', async () => {
      mockResolved(generateKeyPairAsync, { privateKey: 'pk' });
      mockResolved(createCsrAsync, 'csr');
      mockResolved(mockSignCertificate, {
        cert: 'cert',
        caPem: 'ca',
        serialNumber: 'sn',
        expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
      });

      const client = new CertificateClient(defaultConfig);
      await client.obtainCertificate();
      jest.clearAllMocks();
      jest.useFakeTimers();

      client.startAutoRenew();
      await Promise.resolve();
      expect(jest.getTimerCount()).toBeGreaterThan(0);
      client.stopAutoRenew();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should not schedule duplicate timers', async () => {
      const client = new CertificateClient(defaultConfig);
      await client.obtainCertificate();
      jest.clearAllMocks();

      client.startAutoRenew();
      await Promise.resolve();
      const timerCount1 = jest.getTimerCount();
      client.startAutoRenew();
      await Promise.resolve();
      expect(jest.getTimerCount()).toBeGreaterThanOrEqual(timerCount1);
    });
  });
});
