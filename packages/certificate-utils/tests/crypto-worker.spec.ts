import { describe, it, expect, jest } from '@jest/globals';

const mockRegisterHandler = jest.fn<any>();

jest.mock('@trading-model/common/worker/base-worker', () => ({
  BaseWorker: jest.fn().mockImplementation(() => ({
    registerHandler: mockRegisterHandler,
  })),
  __esModule: true,
}));

jest.mock('../src/generate-key-pair', () => ({
  generateKeyPair: jest.fn(() => ({ publicKey: 'pk', privateKey: 'sk' })),
  generateKeyPairWithIdSync: jest.fn(() => ({ publicKey: 'pk', privateKey: 'sk', id: 'id1' })),
  KeyAlgorithm: { RSA_4096: 'rsa', EC_P384: 'ec' },
}));

jest.mock('../src/sign-certificate', () => ({
  signCertificate: jest.fn(() => ({
    serialNumber: 'SN-001',
    certPem: 'cert',
    caPem: 'ca',
    serviceId: 'svc',
    issuedAt: new Date(),
    expiresAt: new Date(),
    fingerprint: 'fp',
  })),
}));

jest.mock('../src/create-csr', () => ({
  createCsr: jest.fn(() => 'csr-pem'),
}));

jest.mock('../src/validate-certificate', () => ({
  validateCertificate: jest.fn(() => ({ valid: true })),
}));

jest.mock('../src/sign', () => ({
  parseKey: jest.fn(() => ({ publicKey: 'pk', privateKey: 'sk' })),
  sign: jest.fn(() => 'signature'),
}));

import { createCryptoWorker } from '../src/crypto-worker';
import { generateKeyPair, generateKeyPairWithIdSync, KeyAlgorithm } from '../src/generate-key-pair';
import { signCertificate } from '../src/sign-certificate';
import { createCsr } from '../src/create-csr';
import { validateCertificate } from '../src/validate-certificate';
import { parseKey, sign } from '../src/sign';

function getHandler(type: string): (job: any) => any {
  const call = mockRegisterHandler.mock.calls.find((c: any[]) => c[0] === type);
  return call ? (call[1] as (job: any) => any) : () => {};
}

describe('createCryptoWorker', () => {
  it('should create a BaseWorker and register all handlers', () => {
    const config = {
      serverUrl: 'ws://localhost',
      schedulerHttpUrl: 'http://localhost',
      capabilities: ['crypto'],
      maxConcurrency: 1,
    };
    const worker = createCryptoWorker(config);

    expect(worker).toBeDefined();
    expect(mockRegisterHandler).toHaveBeenCalledTimes(7);
  });

  it('should register generateKeyPair handler that calls generateKeyPair', async () => {
    createCryptoWorker({} as any);
    const handler = getHandler('generateKeyPair');
    const result = await handler({ payload: { algorithm: KeyAlgorithm.EC_P384 } });

    expect(generateKeyPair).toHaveBeenCalledWith(KeyAlgorithm.EC_P384);
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
  });

  it('should register generateKeyPairWithId handler', async () => {
    createCryptoWorker({} as any);
    const handler = getHandler('generateKeyPairWithId');
    const result = await handler({ payload: { algorithm: KeyAlgorithm.RSA_4096 } });

    expect(generateKeyPairWithIdSync).toHaveBeenCalledWith(KeyAlgorithm.RSA_4096);
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk', id: 'id1' });
  });

  it('should register signCertificate handler', async () => {
    createCryptoWorker({} as any);
    const handler = getHandler('signCertificate');
    const opts = {
      csr: 'csr',
      serviceId: 'svc',
      caKeyPair: {} as any,
      caCertPem: 'ca',
      ttlMs: 3600000,
    };
    const result = await handler({ payload: opts });

    expect(signCertificate).toHaveBeenCalledWith(opts);
    expect(result.serialNumber).toBe('SN-001');
  });

  it('should register createCsr handler', async () => {
    createCryptoWorker({} as any);
    const handler = getHandler('createCsr');
    const opts = { commonName: 'test', san: [], keyPem: 'key' };
    const result = await handler({ payload: opts });

    expect(createCsr).toHaveBeenCalledWith(opts);
    expect(result).toBe('csr-pem');
  });

  it('should register validateCertificate handler', async () => {
    createCryptoWorker({} as any);
    const handler = getHandler('validateCertificate');
    const result = await handler({ payload: { certPem: 'cert', caCertPem: 'ca' } });

    expect(validateCertificate).toHaveBeenCalledWith('cert', 'ca');
    expect(result.valid).toBe(true);
  });

  it('should register validateCertificate handler without caCertPem', async () => {
    createCryptoWorker({} as any);
    const handler = getHandler('validateCertificate');
    const result = await handler({ payload: { certPem: 'cert' } });

    expect(validateCertificate).toHaveBeenCalledWith('cert', '');
    expect(result.valid).toBe(true);
  });

  it('should register parseKey handler', async () => {
    createCryptoWorker({} as any);
    const handler = getHandler('parseKey');
    const result = await handler({ payload: { privateKey: 'key' } });

    expect(parseKey).toHaveBeenCalledWith('key');
    expect(result).toEqual({ publicKey: 'pk', privateKey: 'sk' });
  });

  it('should register sign handler', async () => {
    createCryptoWorker({} as any);
    const handler = getHandler('sign');
    const result = await handler({
      payload: { algorithm: 'sha256', body: 'body', privateKey: 'key' },
    });

    expect(sign).toHaveBeenCalledWith('sha256', 'body', 'key');
    expect(result).toBe('signature');
  });
});
