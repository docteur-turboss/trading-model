import { describe, it, expect, jest, beforeEach } from '@jest/globals';

import type { Request, Response } from 'express';

jest.mock('@trading-model/common/config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockGenerateKeyPairAsync = jest.fn();
const mockGenerateKeyPairWithIdAsync = jest.fn();
const mockSignCertificateAsync = jest.fn();
const mockCreateCsrAsync = jest.fn();
const mockValidateCertificateAsync = jest.fn();
const mockParseKeyAsync = jest.fn();
const mockSignAsync = jest.fn();

jest.mock('@trading-model/certificate-utils/async', () => ({
  generateKeyPairAsync: mockGenerateKeyPairAsync,
  generateKeyPairWithIdAsync: mockGenerateKeyPairWithIdAsync,
  signCertificateAsync: mockSignCertificateAsync,
  createCsrAsync: mockCreateCsrAsync,
  validateCertificateAsync: mockValidateCertificateAsync,
  parseKeyAsync: mockParseKeyAsync,
  signAsync: mockSignAsync,
}));

import {
  generateKeyPairHandler,
  generateKeyPairWithIdHandler,
  signCertificateHandler,
  createCsrHandler,
  validateCertificateHandler,
  parseKeyHandler,
  signHandler,
} from '../../src/controllers/crypto.controller';

function mockReqRes() {
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  return {
    req: {} as Request,
    res: { status, json } as unknown as Response,
  };
}

describe('crypto.controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateKeyPairHandler', () => {
    it('should generate key pair with default algorithm EC_P384', async () => {
      const { req, res } = mockReqRes();
      req.body = {};
      mockGenerateKeyPairAsync.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk' });

      await generateKeyPairHandler(req, res);

      expect(mockGenerateKeyPairAsync).toHaveBeenCalledWith('ec');
      expect(res.json).toHaveBeenCalledWith({ publicKey: 'pk', privateKey: 'sk' });
    });

    it('should generate key pair with specified algorithm', async () => {
      const { req, res } = mockReqRes();
      req.body = { algorithm: 'rsa-4096' };
      mockGenerateKeyPairAsync.mockResolvedValue({ publicKey: 'pk', privateKey: 'sk' });

      await generateKeyPairHandler(req, res);

      expect(mockGenerateKeyPairAsync).toHaveBeenCalledWith('rsa-4096');
      expect(res.json).toHaveBeenCalledWith({ publicKey: 'pk', privateKey: 'sk' });
    });

    it('should return 500 on error', async () => {
      const { req, res } = mockReqRes();
      req.body = {};
      mockGenerateKeyPairAsync.mockRejectedValue(new Error('gen error'));

      await generateKeyPairHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.status().json).toHaveBeenCalledWith({ error: 'gen error' });
    });
  });

  describe('generateKeyPairWithIdHandler', () => {
    it('should generate key pair with id using default algorithm', async () => {
      const { req, res } = mockReqRes();
      req.body = {};
      mockGenerateKeyPairWithIdAsync.mockResolvedValue({
        publicKey: 'pk',
        privateKey: 'sk',
        id: 'key-1',
      });

      await generateKeyPairWithIdHandler(req, res);

      expect(mockGenerateKeyPairWithIdAsync).toHaveBeenCalledWith('ec');
      expect(res.json).toHaveBeenCalledWith({ publicKey: 'pk', privateKey: 'sk', id: 'key-1' });
    });

    it('should generate key pair with id using specified algorithm', async () => {
      const { req, res } = mockReqRes();
      req.body = { algorithm: 'rsa-4096' };
      mockGenerateKeyPairWithIdAsync.mockResolvedValue({
        publicKey: 'pk',
        privateKey: 'sk',
        id: 'key-2',
      });

      await generateKeyPairWithIdHandler(req, res);

      expect(mockGenerateKeyPairWithIdAsync).toHaveBeenCalledWith('rsa-4096');
    });

    it('should return 500 on error', async () => {
      const { req, res } = mockReqRes();
      req.body = {};
      mockGenerateKeyPairWithIdAsync.mockRejectedValue(new Error('id error'));

      await generateKeyPairWithIdHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.status().json).toHaveBeenCalledWith({ error: 'id error' });
    });
  });

  describe('signCertificateHandler', () => {
    const signOpts = {
      csr: 'csr-data',
      serviceId: 'svc-1',
      caKeyPair: {} as any,
      caCertPem: 'ca',
      ttlMs: 3600000,
    };

    it('should sign certificate', async () => {
      const { req, res } = mockReqRes();
      req.body = signOpts;
      const signed = {
        certPem: 'cert',
        caPem: 'ca',
        serialNumber: 'SN-001',
        issuedAt: new Date(),
        expiresAt: new Date(),
        fingerprint: 'fp',
      };
      mockSignCertificateAsync.mockResolvedValue(signed);

      await signCertificateHandler(req, res);

      expect(mockSignCertificateAsync).toHaveBeenCalledWith(signOpts);
      expect(res.json).toHaveBeenCalledWith(signed);
    });

    it('should return 500 on error', async () => {
      const { req, res } = mockReqRes();
      req.body = signOpts;
      mockSignCertificateAsync.mockRejectedValue(new Error('sign error'));

      await signCertificateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.status().json).toHaveBeenCalledWith({ error: 'sign error' });
    });
  });

  describe('createCsrHandler', () => {
    const csrOpts = { commonName: 'test', san: ['test.internal'], keyPem: 'key' };

    it('should create CSR', async () => {
      const { req, res } = mockReqRes();
      req.body = csrOpts;
      mockCreateCsrAsync.mockResolvedValue('csr-pem');

      await createCsrHandler(req, res);

      expect(mockCreateCsrAsync).toHaveBeenCalledWith(csrOpts);
      expect(res.json).toHaveBeenCalledWith('csr-pem');
    });

    it('should return 500 on error', async () => {
      const { req, res } = mockReqRes();
      req.body = csrOpts;
      mockCreateCsrAsync.mockRejectedValue(new Error('csr error'));

      await createCsrHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.status().json).toHaveBeenCalledWith({ error: 'csr error' });
    });
  });

  describe('validateCertificateHandler', () => {
    it('should validate certificate', async () => {
      const { req, res } = mockReqRes();
      req.body = { certPem: 'cert' };
      mockValidateCertificateAsync.mockResolvedValue({ valid: true });

      await validateCertificateHandler(req, res);

      expect(mockValidateCertificateAsync).toHaveBeenCalledWith('cert');
      expect(res.json).toHaveBeenCalledWith({ valid: true });
    });

    it('should return 500 on error', async () => {
      const { req, res } = mockReqRes();
      req.body = { certPem: 'bad-cert' };
      mockValidateCertificateAsync.mockRejectedValue(new Error('validation error'));

      await validateCertificateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.status().json).toHaveBeenCalledWith({ error: 'validation error' });
    });
  });

  describe('parseKeyHandler', () => {
    it('should parse private key', async () => {
      const { req, res } = mockReqRes();
      req.body = { privateKey: 'key' };
      mockParseKeyAsync.mockResolvedValue({ publicKey: 'pk', privateKey: 'key' });

      await parseKeyHandler(req, res);

      expect(mockParseKeyAsync).toHaveBeenCalledWith('key');
      expect(res.json).toHaveBeenCalledWith({ publicKey: 'pk', privateKey: 'key' });
    });

    it('should return 500 on error', async () => {
      const { req, res } = mockReqRes();
      req.body = { privateKey: 'bad-key' };
      mockParseKeyAsync.mockRejectedValue(new Error('parse error'));

      await parseKeyHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.status().json).toHaveBeenCalledWith({ error: 'parse error' });
    });
  });

  describe('signHandler', () => {
    it('should sign data', async () => {
      const { req, res } = mockReqRes();
      req.body = { algorithm: 'sha256', body: 'data', privateKey: 'key' };
      mockSignAsync.mockResolvedValue('signature');

      await signHandler(req, res);

      expect(mockSignAsync).toHaveBeenCalledWith('sha256', 'data', 'key');
      expect(res.json).toHaveBeenCalledWith('signature');
    });

    it('should return 500 on error', async () => {
      const { req, res } = mockReqRes();
      req.body = { algorithm: 'sha256', body: 'data', privateKey: 'bad-key' };
      mockSignAsync.mockRejectedValue(new Error('sign error'));

      await signHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.status().json).toHaveBeenCalledWith({ error: 'sign error' });
    });
  });
});
