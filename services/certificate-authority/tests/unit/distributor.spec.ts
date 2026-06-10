import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('@trading-model/certificate-utils/validate-certificate', () => ({
  validateCertificate: jest.fn(),
}));

import { validateCertificate } from '@trading-model/certificate-utils/validate-certificate';
import { Distributor } from '../../src/core/distributor';

const mockCa = {
  isInitialized: jest.fn(),
  getCaCertPem: jest.fn().mockReturnValue('-----BEGIN CERTIFICATE-----\nca-cert\n-----END CERTIFICATE-----'),
  signServiceCertificate: jest.fn(),
  revokeCertificate: jest.fn(),
  getCrl: jest.fn(),
  initialize: jest.fn(),
};

const mockCertificateStore = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  save: jest.fn(),
  getBySerial: jest.fn(),
  getByServiceId: jest.fn(),
  getExpiring: jest.fn(),
};

const mockCrlStore = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  add: jest.fn(),
  getAll: jest.fn(),
  isRevoked: jest.fn(),
};

const fakeCert = {
  serialNumber: 'SN-001',
  certPem: '-----BEGIN CERTIFICATE-----\ncert-data\n-----END CERTIFICATE-----',
  caPem: '-----BEGIN CERTIFICATE-----\nca-data\n-----END CERTIFICATE-----',
  serviceId: 'svc-1',
  issuedAt: new Date(),
  expiresAt: new Date(Date.now() + 3600000),
  fingerprint: 'abc123',
};

describe('Distributor', () => {
  let distributor: Distributor;

  beforeEach(() => {
    jest.clearAllMocks();

    distributor = new Distributor({
      ca: mockCa as any,
      certificateStore: mockCertificateStore as any,
      crlStore: mockCrlStore as any,
    });
  });

  describe('getCertificate', () => {
    it('should return null when certificate not found', async () => {
      mockCertificateStore.getByServiceId.mockResolvedValue(null);

      const result = await distributor.getCertificate('svc-missing');

      expect(result).toBeNull();
    });

    it('should return null when certificate validation fails', async () => {
      mockCertificateStore.getByServiceId.mockResolvedValue(fakeCert);
      (validateCertificate as jest.Mock).mockReturnValue({ valid: false, reason: 'expired' });

      const result = await distributor.getCertificate('svc-1');

      expect(result).toBeNull();
    });

    it('should return certificate when validation passes', async () => {
      mockCertificateStore.getByServiceId.mockResolvedValue(fakeCert);
      (validateCertificate as jest.Mock).mockReturnValue({ valid: true });

      const result = await distributor.getCertificate('svc-1');

      expect(result).toEqual(fakeCert);
    });
  });

  describe('requestCertificate', () => {
    it('should sign and return a new certificate', async () => {
      const newCert = { ...fakeCert, serialNumber: 'SN-NEW' };
      mockCa.signServiceCertificate.mockResolvedValue(newCert);

      const result = await distributor.requestCertificate('svc-new', 'csr-body');

      expect(mockCa.signServiceCertificate).toHaveBeenCalledWith('svc-new', 'csr-body');
      expect(result.serialNumber).toBe('SN-NEW');
    });

    it('should pass bootstrap token to CA signing', async () => {
      const newCert = { ...fakeCert, serialNumber: 'SN-BOOT' };
      mockCa.signServiceCertificate.mockResolvedValue(newCert);

      const result = await distributor.requestCertificate('svc-boot', 'csr-body', 'bootstrap-token-123');

      expect(mockCa.signServiceCertificate).toHaveBeenCalledWith('svc-boot', 'csr-body');
      expect(result.serialNumber).toBe('SN-BOOT');
    });
  });
});
