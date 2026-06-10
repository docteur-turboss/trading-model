import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCollection = {
  insertOne: jest.fn<any>(),
  insertMany: jest.fn<any>(),
  findOne: jest.fn<any>(),
  find: jest.fn<any>(),
  createIndex: jest.fn<any>(),
  estimatedDocumentCount: jest.fn<any>(),
  aggregate: jest.fn<any>(),
  countDocuments: jest.fn<any>(),
};

const mockDb = {
  collection: jest.fn<any>().mockReturnValue(mockCollection),
};

jest.mock('mongodb', () => ({
  Db: jest.fn(),
  Collection: jest.fn(),
}));

import { AuditRepository, AuditEventDocument } from '../../../src/persistence/audit-repository';

function makeEvent(overrides: Partial<AuditEventDocument> = {}): AuditEventDocument {
  return {
    receivedAt: new Date(),
    metadata: {
      topic: 'test-topic',
      eventType: 'test.event',
      publisher: 'test-service',
      instanceId: 'instance-1',
      messageId: 'msg-1',
      correlationId: 'corr-1',
    },
    payload: { key: 'value' },
    ...overrides,
  };
}

describe('AuditRepository', () => {
  let repository: AuditRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.find.mockReturnValue({
      sort: jest.fn<any>().mockReturnThis(),
      skip: jest.fn<any>().mockReturnThis(),
      limit: jest.fn<any>().mockReturnThis(),
      toArray: jest.fn<any>(),
    });
    mockCollection.aggregate.mockReturnValue({ toArray: jest.fn<any>() });
    repository = new AuditRepository(mockDb as any);
  });

  describe('constructor', () => {
    it('should call db.collection with "audit_events"', () => {
      expect(mockDb.collection).toHaveBeenCalledWith('audit_events');
    });
  });

  describe('ensureIndexes', () => {
    it('should create 4 indexes', async () => {
      mockCollection.createIndex.mockResolvedValue(undefined);

      await repository.ensureIndexes();

      expect(mockCollection.createIndex).toHaveBeenCalledTimes(4);
      expect(mockCollection.createIndex).toHaveBeenCalledWith({ 'metadata.correlationId': 1 });
      expect(mockCollection.createIndex).toHaveBeenCalledWith({
        'metadata.publisher': 1,
        receivedAt: -1,
      });
      expect(mockCollection.createIndex).toHaveBeenCalledWith({
        'metadata.topic': 1,
        receivedAt: -1,
      });
      expect(mockCollection.createIndex).toHaveBeenCalledWith({ receivedAt: -1 });
    });
  });

  describe('insert', () => {
    it('should call insertOne with the event document', async () => {
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'id' });
      const event = makeEvent();

      await repository.insert(event);

      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);
      expect(mockCollection.insertOne).toHaveBeenCalledWith(event);
    });

    it('should throw AppError on failure', async () => {
      mockCollection.insertOne.mockRejectedValue(new Error('DB error'));

      await expect(repository.insert(makeEvent())).rejects.toThrow('Failed to persist audit event');
    });
  });

  describe('insertBatch', () => {
    it('should call insertMany with the events', async () => {
      mockCollection.insertMany.mockResolvedValue({ insertedCount: 2 });
      const events = [
        makeEvent({ metadata: { ...makeEvent().metadata, messageId: 'msg-1' } }),
        makeEvent({ metadata: { ...makeEvent().metadata, messageId: 'msg-2' } }),
      ];

      await repository.insertBatch(events);

      expect(mockCollection.insertMany).toHaveBeenCalledWith(events, { ordered: false });
    });

    it('should not call insertMany for empty array', async () => {
      await repository.insertBatch([]);

      expect(mockCollection.insertMany).not.toHaveBeenCalled();
    });

    it('should throw AppError on failure', async () => {
      mockCollection.insertMany.mockRejectedValue(new Error('DB error'));

      await expect(repository.insertBatch([makeEvent()])).rejects.toThrow(
        'Failed to persist audit event batch'
      );
    });
  });

  describe('findById', () => {
    it('should find event by metadata.messageId', async () => {
      const event = makeEvent();
      mockCollection.findOne.mockResolvedValue(event);

      const result = await repository.findById('msg-1');

      expect(mockCollection.findOne).toHaveBeenCalledWith({ 'metadata.messageId': 'msg-1' });
      expect(result).toEqual(event);
    });

    it('should return null when not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('query', () => {
    it('should apply filters and return paginated results', async () => {
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn<any>().mockResolvedValue([makeEvent()]),
      });
      mockCollection.countDocuments.mockResolvedValue(1);

      const result = await repository.query({
        topic: 'test-topic',
        publisher: 'test-service',
        page: 1,
        limit: 10,
      });

      expect(mockCollection.countDocuments).toHaveBeenCalled();
      expect(result).toMatchObject({
        data: [expect.any(Object)],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      });
    });

    it('should apply date range filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await repository.query({ startDate, endDate });

      const findFilter = (mockCollection.find as jest.Mock).mock.calls[0][0] as any;
      expect(findFilter.receivedAt).toMatchObject({ $gte: startDate, $lte: endDate });
    });

    it('should apply startDate only', async () => {
      const startDate = new Date('2024-06-01');

      await repository.query({ startDate });

      const findFilter = (mockCollection.find as jest.Mock).mock.calls[0][0] as any;
      expect(findFilter.receivedAt.$gte).toEqual(startDate);
      expect(findFilter.receivedAt.$lte).toBeUndefined();
    });

    it('should apply endDate only', async () => {
      const endDate = new Date('2024-12-31');

      await repository.query({ endDate });

      const findFilter = (mockCollection.find as jest.Mock).mock.calls[0][0] as any;
      expect(findFilter.receivedAt.$lte).toEqual(endDate);
      expect(findFilter.receivedAt.$gte).toBeUndefined();
    });

    it('should apply correlationId filter', async () => {
      await repository.query({ correlationId: 'corr-1' });

      const findFilter = (mockCollection.find as jest.Mock).mock.calls[0][0] as any;
      expect(findFilter['metadata.correlationId']).toBe('corr-1');
    });

    it('should cap limit at 1000', async () => {
      await repository.query({ limit: 5000 });

      expect(mockCollection.countDocuments).toHaveBeenCalled();

      const findCall = mockCollection.find.mock.calls[0][1];
      expect(findCall).toBeUndefined();
    });

    it('should handle empty result set', async () => {
      mockCollection.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        toArray: jest.fn<any>().mockResolvedValue([]),
      });
      mockCollection.countDocuments.mockResolvedValue(0);

      const result = await repository.query({});

      expect(result).toMatchObject({
        data: [],
        pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      });
    });
  });

  describe('getStats', () => {
    function makeAggregateResult<T>(value: T[]) {
      return { toArray: jest.fn<any>().mockResolvedValue(value) };
    }

    it('should return aggregated statistics', async () => {
      mockCollection.estimatedDocumentCount.mockResolvedValue(10);
      mockCollection.aggregate
        .mockReturnValueOnce(
          makeAggregateResult([
            { _id: 'topic-a', count: 6 },
            { _id: 'topic-b', count: 4 },
          ])
        )
        .mockReturnValueOnce(makeAggregateResult([{ _id: 'svc-a', count: 10 }]))
        .mockReturnValueOnce(
          makeAggregateResult([
            { earliest: new Date('2024-01-01'), latest: new Date('2024-12-31') },
          ])
        );

      const stats = await repository.getStats();

      expect(stats).toMatchObject({
        totalEvents: 10,
        eventsByTopic: { 'topic-a': 6, 'topic-b': 4 },
        eventsByPublisher: { 'svc-a': 10 },
        dateRange: {
          earliest: new Date('2024-01-01'),
          latest: new Date('2024-12-31'),
        },
      });
    });

    it('should handle empty dateRange aggregations', async () => {
      mockCollection.estimatedDocumentCount.mockResolvedValue(0);
      mockCollection.aggregate
        .mockReturnValueOnce(makeAggregateResult([]))
        .mockReturnValueOnce(makeAggregateResult([]))
        .mockReturnValueOnce(makeAggregateResult([]));

      const stats = await repository.getStats();

      expect(stats.dateRange.earliest).toBeNull();
      expect(stats.dateRange.latest).toBeNull();
    });
  });
});
