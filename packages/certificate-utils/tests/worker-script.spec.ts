import { describe, it, expect, jest, beforeEach } from '@jest/globals';

let mockPostMessage: jest.Mock;
let mockOn: jest.Mock;
let generateKeyPair: jest.Mock;
let generateKeyPairWithIdSync: jest.Mock;
let signCertificate: jest.Mock;
let createCsr: jest.Mock;
let validateCertificate: jest.Mock;
let mockCreatePublicKey: jest.Mock;
let mockExport: jest.Mock;
let mockCreateSign: jest.Mock;
let mockSignUpdate: jest.Mock;
let mockSignResult: jest.Mock;

function loadModule(): void {
  mockPostMessage = jest.fn();
  mockOn = jest.fn();

  generateKeyPair = jest.fn(() => ({ publicKey: 'pk', privateKey: 'sk' }));
  generateKeyPairWithIdSync = jest.fn(() => ({ publicKey: 'pk', privateKey: 'sk', id: 'id1' }));
  signCertificate = jest.fn(() => ({ serialNumber: 'SN', certPem: 'cert', caPem: 'ca', serviceId: 'svc', issuedAt: new Date(), expiresAt: new Date(), fingerprint: 'fp' }));
  createCsr = jest.fn(() => 'csr-pem');
  validateCertificate = jest.fn(() => ({ valid: true }));
  mockExport = jest.fn(() => 'public-key-pem');
  mockCreatePublicKey = jest.fn(() => ({ export: mockExport }));
  mockSignUpdate = jest.fn();
  mockSignResult = jest.fn(() => 'signature-base64');
  mockCreateSign = jest.fn(() => ({ update: mockSignUpdate, sign: mockSignResult }));

  jest.isolateModules(() => {
    jest.mock('node:worker_threads', () => ({
      parentPort: {
        on: mockOn,
        postMessage: mockPostMessage,
      },
    }));
    jest.mock('node:crypto', () => ({
      createPublicKey: mockCreatePublicKey,
      createSign: mockCreateSign,
    }));
    jest.mock('../src/generate-key-pair', () => ({
      generateKeyPair,
      generateKeyPairWithIdSync,
      KeyAlgorithm: { RSA_4096: 'rsa', EC_P384: 'ec' },
    }));
    jest.mock('../src/sign-certificate', () => ({
      signCertificate,
    }));
    jest.mock('../src/create-csr', () => ({
      createCsr,
    }));
    jest.mock('../src/validate-certificate', () => ({
      validateCertificate,
    }));

    require('../src/worker-script');
  });
}

function getMessageHandler(): (task: any) => void {
  const call = mockOn.mock.calls.find((c: any[]) => c[0] === 'message');
  return call ? (call[1] as (task: any) => void) : (() => {});
}

describe('worker-script', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should throw when imported outside a worker thread', () => {
    jest.isolateModules(() => {
      expect(() => require('../src/worker-script')).toThrow('worker-script must be run as a worker thread');
    });
  });

  it('should register message handler on parentPort when imported', () => {
    loadModule();
    expect(mockOn).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should handle generateKeyPair', () => {
    loadModule();
    const handler = getMessageHandler();
    handler({ id: 'task-1', type: 'generateKeyPair', data: { algorithm: 'ec' } });

    expect(generateKeyPair).toHaveBeenCalledWith('ec');
    expect(mockPostMessage).toHaveBeenCalledWith({ id: 'task-1', success: true, data: { publicKey: 'pk', privateKey: 'sk' } });
  });

  it('should handle generateKeyPairWithId', () => {
    loadModule();
    const handler = getMessageHandler();
    handler({ id: 'task-2', type: 'generateKeyPairWithId', data: { algorithm: 'ec' } });

    expect(generateKeyPairWithIdSync).toHaveBeenCalledWith('ec');
    expect(mockPostMessage).toHaveBeenCalledWith({ id: 'task-2', success: true, data: { publicKey: 'pk', privateKey: 'sk', id: 'id1' } });
  });

  it('should handle signCertificate', () => {
    loadModule();
    const handler = getMessageHandler();
    handler({ id: 'task-3', type: 'signCertificate', data: { csr: 'csr', serviceId: 'svc' } as any });

    expect(signCertificate).toHaveBeenCalled();
    expect(mockPostMessage).toHaveBeenCalledWith({ id: 'task-3', success: true, data: expect.objectContaining({ serialNumber: 'SN' }) });
  });

  it('should handle createCsr', () => {
    loadModule();
    const handler = getMessageHandler();
    handler({ id: 'task-4', type: 'createCsr', data: { commonName: 'test', san: [], keyPem: 'key' } });

    expect(createCsr).toHaveBeenCalled();
    expect(mockPostMessage).toHaveBeenCalledWith({ id: 'task-4', success: true, data: 'csr-pem' });
  });

  it('should handle validateCertificate', () => {
    loadModule();
    const handler = getMessageHandler();
    handler({ id: 'task-5', type: 'validateCertificate', data: { certPem: 'cert', caCertPem: 'ca' } });

    expect(validateCertificate).toHaveBeenCalledWith('cert', 'ca');
    expect(mockPostMessage).toHaveBeenCalledWith({ id: 'task-5', success: true, data: { valid: true } });
  });

  it('should handle validateCertificate without caCertPem', () => {
    loadModule();
    const handler = getMessageHandler();
    handler({ id: 'task-5b', type: 'validateCertificate', data: { certPem: 'cert' } });

    expect(validateCertificate).toHaveBeenCalledWith('cert', '');
  });

  it('should handle parseKey', () => {
    loadModule();
    const handler = getMessageHandler();
    handler({ id: 'task-6', type: 'parseKey', data: { privateKey: 'key' } });

    expect(mockCreatePublicKey).toHaveBeenCalledWith('key');
    expect(mockExport).toHaveBeenCalledWith({ type: 'spki', format: 'pem' });
    expect(mockPostMessage).toHaveBeenCalledWith({ id: 'task-6', success: true, data: { publicKey: 'public-key-pem', privateKey: 'key' } });
  });

  it('should handle sign', () => {
    loadModule();
    const handler = getMessageHandler();
    handler({ id: 'task-7', type: 'sign', data: { algorithm: 'sha256', body: 'body', privateKey: 'key' } });

    expect(mockCreateSign).toHaveBeenCalledWith('sha256');
    expect(mockSignUpdate).toHaveBeenCalledWith('body');
    expect(mockSignResult).toHaveBeenCalledWith('key', 'base64');
    expect(mockPostMessage).toHaveBeenCalledWith({ id: 'task-7', success: true, data: 'signature-base64' });
  });

  it('should handle unknown task type with error', () => {
    loadModule();
    const handler = getMessageHandler();
    handler({ id: 'task-8', type: 'unknown', data: {} });

    expect(mockPostMessage).toHaveBeenCalledWith({ id: 'task-8', success: false, error: 'Unknown task type: unknown' });
  });

  it('should handle errors thrown by handlers', () => {
    loadModule();
    generateKeyPair.mockImplementationOnce(() => { throw new Error('gen failed'); });

    const handler = getMessageHandler();
    handler({ id: 'task-9', type: 'generateKeyPair', data: { algorithm: 'ec' } });

    expect(mockPostMessage).toHaveBeenCalledWith({ id: 'task-9', success: false, error: 'gen failed' });
  });
});
