import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../src/controllers/crypto.controller', () => ({
  generateKeyPairHandler: jest.fn(),
  generateKeyPairWithIdHandler: jest.fn(),
  signCertificateHandler: jest.fn(),
  createCsrHandler: jest.fn(),
  validateCertificateHandler: jest.fn(),
  parseKeyHandler: jest.fn(),
  signHandler: jest.fn(),
}));

import { Router } from 'express';
import { cryptoRoutes } from '../../src/routes/crypto.routes';

describe('cryptoRoutes', () => {
  it('should return a router', () => {
    const router = cryptoRoutes();

    expect(router).toBeInstanceOf(Router);
  });
});
