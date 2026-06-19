import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockExecute = jest.fn<any>();
const mockGenerateKeyPair = jest.fn<any>();
const mockGenerateKeyPairWithId = jest.fn<any>();
const mockSignCertificate = jest.fn<any>();
const mockCreateCsr = jest.fn<any>();
const mockValidateCertificate = jest.fn<any>();
const mockParseKey = jest.fn<any>();
const mockSign = jest.fn<any>();

jest.mock('../src/lazy-pool', () => ({
  getPool: jest.fn(() => ({
    execute: mockExecute,
  })),
}));

const mockRemoteSigningClient = {
  generateKeyPair: mockGenerateKeyPair,
  generateKeyPairWithId: mockGenerateKeyPairWithId,
  signCertificate: mockSignCertificate,
  createCsr: mockCreateCsr,
  validateCertificate: mockValidateCertificate,
  parseKey: mockParseKey,
  sign: mockSign,
};

jest.mock('../src/remote-signing-client', () => ({
  RemoteSigningClient: jest.fn(() => mockRemoteSigningClient),
}));

import {
  generateKeyPairAsync,
  generateKeyPairWithIdAsync,
  signCertificateAsync,
  createCsrAsync,
  validateCertificateAsync,
  parseKeyAsync,
  signAsync,
  setRemoteSigningClient,
} from '../src/async';

describe('async module - pool path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setRemoteSigningClient(null);
  });

  it('generateKeyPairAsync should delegate to pool', async () => {
    mockExecute.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk' });
    const result = await generateKeyPairAsync();
    expect(mockExecute).toHaveBeenCalledWith('generateKeyPair', { algorithm: 'ec' });
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
  });

  it('generateKeyPairWithIdAsync should delegate to pool', async () => {
    mockExecute.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk', id: 'id1' });
    const result = await generateKeyPairWithIdAsync();
    expect(mockExecute).toHaveBeenCalledWith('generateKeyPairWithId', { algorithm: 'ec' });
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk', id: 'id1' });
  });

  it('signCertificateAsync should delegate to pool', async () => {
    mockExecute.mockResolvedValue({ serialNumber: 'SN-001', certPem: 'cert', caPem: 'ca', serviceId: 'svc-1', issuedAt: new Date(), expiresAt: new Date(), fingerprint: 'fp' });
    const result = await signCertificateAsync({} as any);
    expect(mockExecute).toHaveBeenCalledWith('signCertificate', {});
    expect(result.serialNumber).toBe('SN-001');
  });

  it('createCsrAsync should delegate to pool', async () => {
    mockExecute.mockResolvedValue('csr-pem');
    const result = await createCsrAsync({} as any);
    expect(mockExecute).toHaveBeenCalledWith('createCsr', {});
    expect(result).toBe('csr-pem');
  });

  it('validateCertificateAsync should delegate to pool', async () => {
    mockExecute.mockResolvedValue({ valid: true });
    const result = await validateCertificateAsync('cert');
    expect(mockExecute).toHaveBeenCalledWith('validateCertificate', { certPem: 'cert', caCertPem: undefined });
    expect(result.valid).toBe(true);
  });

  it('validateCertificateAsync with caCertPem should delegate to pool', async () => {
    mockExecute.mockResolvedValue({ valid: true });
    const result = await validateCertificateAsync('cert', 'ca-cert');
    expect(mockExecute).toHaveBeenCalledWith('validateCertificate', { certPem: 'cert', caCertPem: 'ca-cert' });
    expect(result.valid).toBe(true);
  });

  it('parseKeyAsync should delegate to pool', async () => {
    mockExecute.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk' });
    const result = await parseKeyAsync('private-key');
    expect(mockExecute).toHaveBeenCalledWith('parseKey', { privateKey: 'private-key' });
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
  });

  it('signAsync should delegate to pool', async () => {
    mockExecute.mockResolvedValue('signature');
    const result = await signAsync('sha256', 'body', 'private-key');
    expect(mockExecute).toHaveBeenCalledWith('sign', { algorithm: 'sha256', body: 'body', privateKey: 'private-key' });
    expect(result).toBe('signature');
  });
});

describe('async module - remote client path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setRemoteSigningClient(mockRemoteSigningClient as any);
  });

  it('generateKeyPairAsync should delegate to remote client', async () => {
    mockGenerateKeyPair.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk' });
    const result = await generateKeyPairAsync();
    expect(mockGenerateKeyPair).toHaveBeenCalledWith('ec');
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
  });

  it('generateKeyPairAsync with RSA should delegate to remote client', async () => {
    mockGenerateKeyPair.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk' });
    const result = await generateKeyPairAsync('rsa');
    expect(mockGenerateKeyPair).toHaveBeenCalledWith('rsa');
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
  });

  it('generateKeyPairWithIdAsync should delegate to remote client', async () => {
    mockGenerateKeyPairWithId.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk', id: 'id1' });
    const result = await generateKeyPairWithIdAsync();
    expect(mockGenerateKeyPairWithId).toHaveBeenCalledWith('ec');
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk', id: 'id1' });
  });

  it('signCertificateAsync should delegate to remote client', async () => {
    mockSignCertificate.mockResolvedValue({ serialNumber: 'SN-001', certPem: 'cert', caPem: 'ca', serviceId: 'svc-1', issuedAt: new Date(), expiresAt: new Date(), fingerprint: 'fp' });
    const result = await signCertificateAsync({} as any);
    expect(mockSignCertificate).toHaveBeenCalledWith({});
    expect(result.serialNumber).toBe('SN-001');
  });

  it('createCsrAsync should delegate to remote client', async () => {
    mockCreateCsr.mockResolvedValue('csr-pem');
    const result = await createCsrAsync({} as any);
    expect(mockCreateCsr).toHaveBeenCalledWith({});
    expect(result).toBe('csr-pem');
  });

  it('validateCertificateAsync should delegate to remote client', async () => {
    mockValidateCertificate.mockResolvedValue({ valid: true });
    const result = await validateCertificateAsync('cert');
    expect(mockValidateCertificate).toHaveBeenCalledWith('cert');
    expect(result.valid).toBe(true);
  });

  it('parseKeyAsync should delegate to remote client', async () => {
    mockParseKey.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk' });
    await parseKeyAsync('private-key');
    expect(mockParseKey).toHaveBeenCalledWith('private-key');
  });

  it('signAsync should delegate to remote client', async () => {
    mockSign.mockResolvedValue('signature');
    const result = await signAsync('sha256', 'body', 'private-key');
    expect(mockSign).toHaveBeenCalledWith('sha256', 'body', 'private-key');
    expect(result).toBe('signature');
  });

  it('setRemoteSigningClient(null) should clear remote client', async () => {
    setRemoteSigningClient(null);
    mockExecute.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk' });
    const result = await generateKeyPairAsync();
    expect(mockExecute).toHaveBeenCalled();
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
  });
});
