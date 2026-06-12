import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockInsertOne = jest.fn();
const mockFindOne = jest.fn();
const mockFind = jest.fn();
const mockCreateIndex = jest.fn();
const mockCollection = jest.fn();
const mockDb = jest.fn();
const mockClose = jest.fn();

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    close: mockClose,
    db: mockDb,
  })),
}));

mockDb.mockReturnValue({
  collection: mockCollection,
});

mockCollection.mockReturnValue({
  insertOne: mockInsertOne,
  findOne: mockFindOne,
  find: mockFind,
  createIndex: mockCreateIndex,
});

import { CertificateStore } from '../../src/persistence/certificate-store';

const sampleCert = {
  serialNumber: 'SN-001',
  certPem: 'cert-pem',
  caPem: 'ca-pem',
  serviceId: 'svc-1',
  issuedAt: new Date('2024-01-01'),
  expiresAt: new Date('2025-01-01'),
  fingerprint: 'abc123',
};

describe('CertificateStore', () => {
  let store: CertificateStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new CertificateStore('mongodb://localhost:27017/test');
  });

  describe('connect', () => {
    it('should connect and create indexes', async () => {
      await store.connect();

      expect(mockCreateIndex).toHaveBeenCalledWith({ serialNumber: 1 }, { unique: true });
      expect(mockCreateIndex).toHaveBeenCalledWith({ serviceId: 1 });
      expect(mockCreateIndex).toHaveBeenCalledWith({ expiresAt: 1 });
    });
  });

  describe('disconnect', () => {
    it('should close the connection', async () => {
      await store.connect();
      await store.disconnect();

      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('save', () => {
    it('should throw if not connected', async () => {
      await expect(store.save(sampleCert)).rejects.toThrow('Not connected');
    });

    it('should insert certificate document', async () => {
      await store.connect();
      await store.save(sampleCert);

      expect(mockInsertOne).toHaveBeenCalledWith(sampleCert);
    });
  });

  describe('getBySerial', () => {
    it('should throw if not connected', async () => {
      await expect(store.getBySerial('SN-001')).rejects.toThrow('Not connected');
    });

    it('should return certificate by serial number', async () => {
      mockFindOne.mockResolvedValue(sampleCert);
      await store.connect();

      const result = await store.getBySerial('SN-001');

      expect(mockFindOne).toHaveBeenCalledWith({ serialNumber: 'SN-001' });
      expect(result).toEqual(sampleCert);
    });

    it('should return null when not found', async () => {
      mockFindOne.mockResolvedValue(null);
      await store.connect();

      const result = await store.getBySerial('SN-MISSING');

      expect(result).toBeNull();
    });
  });

  describe('getByServiceId', () => {
    it('should throw if not connected', async () => {
      await expect(store.getByServiceId('svc-1')).rejects.toThrow('Not connected');
    });

    it('should return latest certificate by serviceId', async () => {
      mockFindOne.mockResolvedValue(sampleCert);
      await store.connect();

      const result = await store.getByServiceId('svc-1');

      expect(mockFindOne).toHaveBeenCalledWith({ serviceId: 'svc-1' }, { sort: { issuedAt: -1 } });
      expect(result).toEqual(sampleCert);
    });

    it('should return null when not found', async () => {
      mockFindOne.mockResolvedValue(null);
      await store.connect();

      const result = await store.getByServiceId('svc-missing');

      expect(result).toBeNull();
    });
  });

  describe('getExpiring', () => {
    it('should throw if not connected', async () => {
      await expect(store.getExpiring(86400000)).rejects.toThrow('Not connected');
    });

    it('should return certificates expiring within margin', async () => {
      mockFind.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([sampleCert]),
      });
      await store.connect();

      const result = await store.getExpiring(86400000);

      expect(mockFind).toHaveBeenCalledWith({
        expiresAt: { $lte: expect.any(Date) },
      });
      expect(result).toHaveLength(1);
      expect(result[0].serialNumber).toBe('SN-001');
    });

    it('should return empty array when none expiring', async () => {
      mockFind.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });
      await store.connect();

      const result = await store.getExpiring(86400000);

      expect(result).toEqual([]);
    });
  });
});
