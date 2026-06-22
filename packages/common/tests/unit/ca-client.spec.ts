import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGet = jest.fn<any>();
const mockPost = jest.fn<any>();

jest.mock('../../src/config/http-client', () => {
  const MockHttpClient: any = jest.fn(() => ({
    get: mockGet,
    post: mockPost,
    delete: jest.fn(),
  }));
  MockHttpClient.createWithTls = jest.fn(() => ({
    get: mockGet,
    post: mockPost,
    delete: jest.fn(),
  }));
  return { HttpClient: MockHttpClient };
});

import { CaClient } from '../../src/ca/ca-client';

describe('CaClient', () => {
  let client: CaClient;

  const signResponse = {
    cert: '-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----',
    caPem: '-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----',
    serialNumber: '1234567890abcdef',
    expiresAt: '2027-06-16T15:00:00Z',
    fingerprint: 'SHA256:abc123...',
  };

  const getResponse = {
    cert: '-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----',
    caPem: '-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----',
    serialNumber: 'abcdef1234567890',
    issuedAt: '2026-06-16T15:00:00Z',
    expiresAt: '2027-06-16T15:00:00Z',
    fingerprint: 'SHA256:def456...',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new CaClient({ baseUrl: 'https://ca.example.com:8443' });
  });

  describe('constructor', () => {
    it('should strip trailing slash from baseUrl', () => {
      const c = new CaClient({ baseUrl: 'https://ca.example.com/' });
      expect(c).toBeInstanceOf(CaClient);
    });

    it('should create with TLS config', () => {
      const c = new CaClient({
        baseUrl: 'https://ca.example.com',
        tls: {
          ca: '/etc/ca.pem',
          cert: '/etc/cert.pem',
          key: '/etc/key.pem',
        },
      });
      expect(c).toBeInstanceOf(CaClient);
    });
  });

  describe('signCertificate', () => {
    it('should POST to the sign endpoint and return the signed certificate', async () => {
      mockPost.mockResolvedValueOnce(signResponse);

      const result = await client.signCertificate('my-service', '-----BEGIN CSR-----');

      expect(mockPost).toHaveBeenCalledWith('https://ca.example.com:8443/api/v1/certificate/sign', {
        serviceId: 'my-service',
        csr: '-----BEGIN CSR-----',
      });
      expect(result).toEqual(signResponse);
    });

    it('should include optional ttlMs and bootstrapToken', async () => {
      mockPost.mockResolvedValueOnce(signResponse);

      await client.signCertificate('my-service', 'csr', {
        ttlMs: 86400000,
        bootstrapToken: 'token-123',
      });

      expect(mockPost).toHaveBeenCalledWith('https://ca.example.com:8443/api/v1/certificate/sign', {
        serviceId: 'my-service',
        csr: 'csr',
        ttlMs: 86400000,
        bootstrapToken: 'token-123',
      });
    });

    it('should throw when response is empty', async () => {
      mockPost.mockResolvedValueOnce(undefined);

      await expect(client.signCertificate('my-service', 'csr')).rejects.toThrow(
        'Empty response from CA sign endpoint'
      );
    });

    it('should propagate HttpClient errors', async () => {
      mockPost.mockRejectedValueOnce(new Error('Connection refused'));

      await expect(client.signCertificate('my-service', 'csr')).rejects.toThrow(
        'Connection refused'
      );
    });
  });

  describe('getCertificate', () => {
    it('should GET the certificate for a service', async () => {
      mockGet.mockResolvedValueOnce(getResponse);

      const result = await client.getCertificate('my-service');

      expect(mockGet).toHaveBeenCalledWith(
        'https://ca.example.com:8443/api/v1/certificate/my-service'
      );
      expect(result).toEqual(getResponse);
    });

    it('should return null on 204 No Content', async () => {
      mockGet.mockResolvedValueOnce(undefined);

      const result = await client.getCertificate('my-service');

      expect(result).toBeNull();
    });

    it('should URL-encode the serviceId', async () => {
      mockGet.mockResolvedValueOnce(getResponse);

      await client.getCertificate('my service/foo');

      expect(mockGet).toHaveBeenCalledWith(
        'https://ca.example.com:8443/api/v1/certificate/my%20service%2Ffoo'
      );
    });
  });

  describe('revokeCertificate', () => {
    it('should POST to the revoke endpoint', async () => {
      mockPost.mockResolvedValueOnce(undefined);

      await client.revokeCertificate('serial-123', 'compromised');

      expect(mockPost).toHaveBeenCalledWith(
        'https://ca.example.com:8443/api/v1/certificate/revoke',
        { serialNumber: 'serial-123', reason: 'compromised' }
      );
    });

    it('should propagate HttpClient errors', async () => {
      mockPost.mockRejectedValueOnce(new Error('Timeout'));

      await expect(client.revokeCertificate('serial-123', 'key-compromise')).rejects.toThrow(
        'Timeout'
      );
    });
  });
});
