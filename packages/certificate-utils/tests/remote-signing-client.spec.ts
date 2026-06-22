import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockPost: any = jest.fn();
const mockHttpClientInstance = { post: mockPost };

const MockHttpClient: any = jest.fn(() => mockHttpClientInstance);
MockHttpClient.createWithTls = jest.fn();

jest.mock('@trading-model/common/config/http-client', () => ({
  HttpClient: MockHttpClient,
}));

import { RemoteSigningClient } from '../src/remote-signing-client';
import { KeyAlgorithm } from '../src/generate-key-pair';

function getClient(options: Record<string, any> = {}): RemoteSigningClient {
  return new RemoteSigningClient({
    baseUrl: 'https://signer.example.com',
    ...options,
  });
}

describe('RemoteSigningClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should strip trailing slashes from baseUrl', () => {
    const c = getClient({ baseUrl: 'https://signer.example.com///' });
    expect(c).toBeDefined();
  });

  it('should create with TLS config', () => {
    const c = getClient({
      tls: {
        RootCACertPath: '/ca.pem',
        CertificatePath: '/cert.pem',
        KeyCertificatePath: '/key.pem',
      },
    });
    expect(MockHttpClient.createWithTls).toHaveBeenCalledWith({
      RootCACertPath: '/ca.pem',
      CertificatePath: '/cert.pem',
      KeyCertificatePath: '/key.pem',
    });
    expect(MockHttpClient).not.toHaveBeenCalled();
    expect(c).toBeDefined();
  });

  describe('generateKeyPair', () => {
    it('should post to generate-key-pair endpoint', async () => {
      mockPost.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk' });
      const client = getClient();
      const result = await client.generateKeyPair(KeyAlgorithm.EC_P384);

      expect(mockPost).toHaveBeenCalledWith(
        'https://signer.example.com/api/v1/crypto/generate-key-pair',
        { algorithm: 'ec' },
        { timeoutMs: 30000 }
      );
      expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
    });

    it('should throw on empty response', async () => {
      mockPost.mockResolvedValue(null);
      const client = getClient();
      await expect(client.generateKeyPair()).rejects.toThrow('Empty response from remote signer');
    });
  });

  describe('generateKeyPairWithId', () => {
    it('should post to generate-key-pair-with-id endpoint', async () => {
      mockPost.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk', id: 'id1' });
      const client = getClient();
      const result = await client.generateKeyPairWithId(KeyAlgorithm.EC_P384);

      expect(mockPost).toHaveBeenCalledWith(
        'https://signer.example.com/api/v1/crypto/generate-key-pair-with-id',
        { algorithm: 'ec' },
        { timeoutMs: 30000 }
      );
      expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk', id: 'id1' });
    });

    it('should throw on empty response', async () => {
      mockPost.mockResolvedValue(null);
      const client = getClient();
      await expect(client.generateKeyPairWithId()).rejects.toThrow(
        'Empty response from remote signer'
      );
    });
  });

  describe('signCertificate', () => {
    it('should post to sign-certificate endpoint', async () => {
      const signed = {
        serialNumber: 'SN',
        certPem: 'cert',
        caPem: 'ca',
        serviceId: 'svc',
        issuedAt: new Date(),
        expiresAt: new Date(),
        fingerprint: 'fp',
      };
      mockPost.mockResolvedValue(signed);
      const client = getClient();
      const options = {
        csr: 'csr',
        serviceId: 'svc',
        caKeyPair: { publicKey: 'pk', privateKey: 'sk' } as any,
        caCertPem: 'ca',
        ttlMs: 3600000,
      };

      const result = await client.signCertificate(options);

      expect(mockPost).toHaveBeenCalledWith(
        'https://signer.example.com/api/v1/crypto/sign-certificate',
        options,
        { timeoutMs: 30000 }
      );
      expect(result).toEqual(signed);
    });

    it('should throw on empty response', async () => {
      mockPost.mockResolvedValue(null);
      const client = getClient();
      await expect(client.signCertificate({} as any)).rejects.toThrow(
        'Empty response from remote signer'
      );
    });
  });

  describe('createCsr', () => {
    it('should post to create-csr endpoint', async () => {
      mockPost.mockResolvedValue('csr-pem');
      const client = getClient();
      const options = { commonName: 'test', san: [], keyPem: 'key' };

      const result = await client.createCsr(options);

      expect(mockPost).toHaveBeenCalledWith(
        'https://signer.example.com/api/v1/crypto/create-csr',
        options,
        { timeoutMs: 30000 }
      );
      expect(result).toBe('csr-pem');
    });

    it('should throw on undefined response', async () => {
      mockPost.mockResolvedValue(undefined);
      const client = getClient();
      await expect(client.createCsr({} as any)).rejects.toThrow(
        'Empty response from remote signer'
      );
    });
  });

  describe('validateCertificate', () => {
    it('should post to validate-certificate endpoint', async () => {
      mockPost.mockResolvedValue({ valid: true });
      const client = getClient();
      const result = await client.validateCertificate('cert-pem');

      expect(mockPost).toHaveBeenCalledWith(
        'https://signer.example.com/api/v1/crypto/validate-certificate',
        { certPem: 'cert-pem' },
        { timeoutMs: 30000 }
      );
      expect(result).toEqual({ valid: true });
    });

    it('should throw on empty response', async () => {
      mockPost.mockResolvedValue(null);
      const client = getClient();
      await expect(client.validateCertificate('cert')).rejects.toThrow(
        'Empty response from remote signer'
      );
    });
  });

  describe('parseKey', () => {
    it('should post to parse-key endpoint', async () => {
      mockPost.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk' });
      const client = getClient();
      const result = await client.parseKey('private-key');

      expect(mockPost).toHaveBeenCalledWith(
        'https://signer.example.com/api/v1/crypto/parse-key',
        { privateKey: 'private-key' },
        { timeoutMs: 30000 }
      );
      expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
    });

    it('should throw on empty response', async () => {
      mockPost.mockResolvedValue(null);
      const client = getClient();
      await expect(client.parseKey('key')).rejects.toThrow('Empty response from remote signer');
    });
  });

  describe('sign', () => {
    it('should post to sign endpoint', async () => {
      mockPost.mockResolvedValue('signature');
      const client = getClient();
      const result = await client.sign('sha256', 'body', 'private-key');

      expect(mockPost).toHaveBeenCalledWith(
        'https://signer.example.com/api/v1/crypto/sign',
        { algorithm: 'sha256', body: 'body', privateKey: 'private-key' },
        { timeoutMs: 30000 }
      );
      expect(result).toBe('signature');
    });

    it('should throw on undefined response', async () => {
      mockPost.mockResolvedValue(undefined);
      const client = getClient();
      await expect(client.sign('sha256', 'body', 'key')).rejects.toThrow(
        'Empty response from remote signer'
      );
    });
  });
});
