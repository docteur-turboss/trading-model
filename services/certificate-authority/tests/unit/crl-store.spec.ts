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

import { CrlStore } from '../../src/persistence/crl-store';

const sampleRevoked = {
  serialNumber: 'SN-REVOKED',
  serviceId: 'svc-1',
  revokedAt: new Date('2024-06-01'),
  reason: 'key_compromise',
};

describe('CrlStore', () => {
  let store: CrlStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new CrlStore('mongodb://localhost:27017/test');
  });

  describe('connect', () => {
    it('should create indexes on connect', async () => {
      await store.connect();

      expect(mockCreateIndex).toHaveBeenCalledWith({ serialNumber: 1 }, { unique: true });
    });
  });

  describe('disconnect', () => {
    it('should close the connection', async () => {
      await store.connect();
      await store.disconnect();

      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('add', () => {
    it('should throw if not connected', async () => {
      await expect(store.add(sampleRevoked)).rejects.toThrow('Not connected');
    });

    it('should insert revoked certificate entry', async () => {
      await store.connect();
      await store.add(sampleRevoked);

      expect(mockInsertOne).toHaveBeenCalledWith(sampleRevoked);
    });
  });

  describe('getAll', () => {
    it('should throw if not connected', async () => {
      await expect(store.getAll()).rejects.toThrow('Not connected');
    });

    it('should return all revoked certificates', async () => {
      mockFind.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([sampleRevoked]),
      });
      await store.connect();

      const result = await store.getAll();

      expect(result).toHaveLength(1);
      expect(result[0].serialNumber).toBe('SN-REVOKED');
    });

    it('should return empty array when none revoked', async () => {
      mockFind.mockReturnValue({
        toArray: jest.fn().mockResolvedValue([]),
      });
      await store.connect();

      const result = await store.getAll();

      expect(result).toEqual([]);
    });
  });

  describe('isRevoked', () => {
    it('should throw if not connected', async () => {
      await expect(store.isRevoked('SN-001')).rejects.toThrow('Not connected');
    });

    it('should return true for revoked serial', async () => {
      mockFindOne.mockResolvedValue(sampleRevoked);
      await store.connect();

      const result = await store.isRevoked('SN-REVOKED');

      expect(result).toBe(true);
    });

    it('should return false for non-revoked serial', async () => {
      mockFindOne.mockResolvedValue(null);
      await store.connect();

      const result = await store.isRevoked('SN-NOT-REVOKED');

      expect(result).toBe(false);
    });
  });
});
