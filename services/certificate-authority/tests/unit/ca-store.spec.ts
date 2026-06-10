import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockInsertOne = jest.fn();
const mockFindOne = jest.fn();
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
});

import { CaStore } from '../../src/persistence/ca-store';

const sampleCaMeta = {
  id: 'CA-001',
  caCertPem: '-----BEGIN CERTIFICATE-----\nca-cert\n-----END CERTIFICATE-----',
  createdAt: new Date('2024-01-01'),
  expiresAt: new Date('2025-01-01'),
  fingerprint: 'abc123',
};

describe('CaStore', () => {
  let store: CaStore;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new CaStore('mongodb://localhost:27017/test');
  });

  describe('connect', () => {
    it('should connect to database', async () => {
      await store.connect();

      expect(mockCollection).toHaveBeenCalledWith('ca_store');
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
      await expect(store.save(sampleCaMeta)).rejects.toThrow('Not connected');
    });

    it('should insert metadata document', async () => {
      await store.connect();
      await store.save(sampleCaMeta);

      expect(mockInsertOne).toHaveBeenCalledWith(sampleCaMeta);
    });
  });

  describe('getLatest', () => {
    it('should throw if not connected', async () => {
      await expect(store.getLatest()).rejects.toThrow('Not connected');
    });

    it('should return the latest CA metadata', async () => {
      mockFindOne.mockResolvedValue(sampleCaMeta);
      await store.connect();

      const result = await store.getLatest();

      expect(mockFindOne).toHaveBeenCalledWith({}, { sort: { createdAt: -1 } });
      expect(result).toEqual(sampleCaMeta);
    });

    it('should return null when no metadata exists', async () => {
      mockFindOne.mockResolvedValue(null);
      await store.connect();

      const result = await store.getLatest();

      expect(result).toBeNull();
    });
  });
});
