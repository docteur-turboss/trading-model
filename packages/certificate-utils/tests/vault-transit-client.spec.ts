import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockPost: any = jest.fn();

const mockGet: any = jest.fn();

const mockDelete: any = jest.fn();
const mockHttpClientInstance = { post: mockPost, get: mockGet, delete: mockDelete };

const MockHttpClient: any = jest.fn(() => mockHttpClientInstance);
MockHttpClient.createWithTls = jest.fn();

jest.mock('@trading-model/common/config/http-client', () => ({
  HttpClient: MockHttpClient,
}));

jest.mock('@trading-model/common/config/logger', () => ({
  logger: {
    warn: jest.fn(),
  },
}));

jest.mock('@trading-model/common/utils/errors', () => ({
  normalizeError: jest.fn((err: unknown) => (err instanceof Error ? err : new Error(String(err)))),
}));

import { VaultTransitClient } from '../src/vault-transit-client';

function createClient(overrides: Record<string, any> = {}): VaultTransitClient {
  return new VaultTransitClient({
    vaultUrl: 'https://vault.example.com',
    token: 's.test-token',
    ...overrides,
  });
}

describe('VaultTransitClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should strip trailing slashes from vaultUrl', () => {
    const client = createClient({ vaultUrl: 'https://vault.example.com///' });
    expect(client).toBeDefined();
  });

  it('should create with TLS config', () => {
    const client = new VaultTransitClient({
      vaultUrl: 'https://vault.example.com',
      token: 's.test',
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
    expect(client).toBeDefined();
  });

  it('should create with namespace', () => {
    const client = createClient({ namespace: 'ns1' });
    expect(client).toBeDefined();
  });

  describe('createKey', () => {
    it('should post to create key endpoint with rsa type', async () => {
      mockPost.mockResolvedValue(undefined);
      const client = createClient();

      await client.createKey('my-key', 'rsa-4096');

      expect(mockPost).toHaveBeenCalledWith(
        'https://vault.example.com/v1/transit/keys/my-key',
        { type: 'rsa-4096', exportable: false, allow_plaintext_backup: false },
        { headers: { 'X-Vault-Token': 's.test-token' }, timeoutMs: 30000 }
      );
    });

    it('should post to create key endpoint with ecdsa type', async () => {
      mockPost.mockResolvedValue(undefined);
      const client = createClient();

      await client.createKey('my-key', 'ecdsa-p384');

      expect(mockPost).toHaveBeenCalledWith(
        'https://vault.example.com/v1/transit/keys/my-key',
        { type: 'ecdsa-p384', exportable: false, allow_plaintext_backup: false },
        { headers: { 'X-Vault-Token': 's.test-token' }, timeoutMs: 30000 }
      );
    });

    it('should include namespace header when configured', async () => {
      mockPost.mockResolvedValue(undefined);
      const client = createClient({ namespace: 'ns1' });

      await client.createKey('my-key', 'ecdsa-p384');

      expect(mockPost).toHaveBeenCalledWith(expect.any(String), expect.any(Object), {
        headers: { 'X-Vault-Token': 's.test-token', 'X-Vault-Namespace': 'ns1' },
        timeoutMs: 30000,
      });
    });
  });

  describe('sign', () => {
    it('should sign data and return signature', async () => {
      mockPost.mockResolvedValue({ data: { signature: 'vault:v1:base64sig' } });
      const client = createClient();

      const result = await client.sign('my-key', 'sha256', 'input-data');

      expect(mockPost).toHaveBeenCalledWith(
        'https://vault.example.com/v1/transit/sign/my-key',
        { input: Buffer.from('input-data', 'utf8').toString('base64'), hash_algorithm: 'sha2-256' },
        { headers: { 'X-Vault-Token': 's.test-token' }, timeoutMs: 30000 }
      );
      expect(result).toBe('base64sig');
    });

    it('should handle signature without colon prefix', async () => {
      mockPost.mockResolvedValue({ data: { signature: 'base64sig' } });
      const client = createClient();

      const result = await client.sign('my-key', 'sha384', 'data');

      expect(result).toBe('base64sig');
    });

    it('should throw on empty response', async () => {
      mockPost.mockResolvedValue(null);
      const client = createClient();

      await expect(client.sign('my-key', 'sha256', 'data')).rejects.toThrow(
        'Empty response from Vault Transit sign'
      );
    });

    it('should map algorithm to vault hash algorithm', async () => {
      mockPost.mockResolvedValue({ data: { signature: 'vault:v1:sig' } });
      const client = createClient();

      await client.sign('my-key', 'sha512', 'data');
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ hash_algorithm: 'sha2-512' }),
        expect.any(Object)
      );

      await client.sign('my-key', 'sha1', 'data');
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ hash_algorithm: 'sha1' }),
        expect.any(Object)
      );

      await client.sign('my-key', 'unknown', 'data');
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ hash_algorithm: 'sha2-256' }),
        expect.any(Object)
      );
    });
  });

  describe('signBytes', () => {
    it('should sign DER bytes and return binary signature', async () => {
      mockPost.mockResolvedValue({ data: { signature: 'vault:v1:AAECAw==' } });
      const client = createClient();

      const result = await client.signBytes('my-key', '\x00\x01\x02\x03');

      expect(mockPost).toHaveBeenCalledWith(
        'https://vault.example.com/v1/transit/sign/my-key',
        { input: 'AAECAw==', hash_algorithm: 'sha2-256' },
        { headers: { 'X-Vault-Token': 's.test-token' }, timeoutMs: 30000 }
      );
      expect(result).toBe('\x00\x01\x02\x03');
    });

    it('should handle signature without colon prefix', async () => {
      mockPost.mockResolvedValue({ data: { signature: 'AAECAw==' } });
      const client = createClient();

      const result = await client.signBytes('my-key', '\x00\x01\x02\x03');

      expect(result).toBe('\x00\x01\x02\x03');
    });

    it('should throw on empty response', async () => {
      mockPost.mockResolvedValue(null);
      const client = createClient();

      await expect(client.signBytes('my-key', 'der')).rejects.toThrow(
        'Empty response from Vault Transit sign'
      );
    });
  });

  describe('readPublicKey', () => {
    it('should read public key from vault', async () => {
      mockGet.mockResolvedValue({
        data: { keys: { '1': 'public-key-pem', '2': 'public-key-pem-v2' } },
      });
      const client = createClient();

      const result = await client.readPublicKey('my-key');

      expect(mockGet).toHaveBeenCalledWith('https://vault.example.com/v1/transit/keys/my-key', {
        headers: { 'X-Vault-Token': 's.test-token' },
        timeoutMs: 30000,
      });
      expect(result).toBe('public-key-pem-v2');
    });

    it('should throw when key is not found', async () => {
      mockGet.mockResolvedValue(null);
      const client = createClient();

      await expect(client.readPublicKey('my-key')).rejects.toThrow('not found in Vault Transit');
    });

    it('should throw when key has no versions', async () => {
      mockGet.mockResolvedValue({ data: { keys: {} } });
      const client = createClient();

      await expect(client.readPublicKey('my-key')).rejects.toThrow('has no versions');
    });
  });

  describe('keyExists', () => {
    it('should return true when key exists', async () => {
      mockGet.mockResolvedValue({ data: { keys: { '1': 'pk' } } });
      const client = createClient();

      const result = await client.keyExists('my-key');

      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      const err = new Error('Not found');
      mockGet.mockRejectedValue(err);
      const client = createClient();

      const result = await client.keyExists('my-key');

      expect(result).toBe(false);
    });
  });

  describe('deleteKey', () => {
    it('should delete key from vault', async () => {
      mockDelete.mockResolvedValue(undefined);
      const client = createClient();

      await client.deleteKey('my-key');

      expect(mockDelete).toHaveBeenCalledWith(
        'https://vault.example.com/v1/transit/keys/my-key',
        undefined,
        { headers: { 'X-Vault-Token': 's.test-token' }, timeoutMs: 30000 }
      );
    });

    it('should encode key name in URL', async () => {
      mockDelete.mockResolvedValue(undefined);
      const client = createClient();

      await client.deleteKey('my/key/name');

      expect(mockDelete).toHaveBeenCalledWith(
        'https://vault.example.com/v1/transit/keys/my%2Fkey%2Fname',
        undefined,
        expect.any(Object)
      );
    });
  });
});
