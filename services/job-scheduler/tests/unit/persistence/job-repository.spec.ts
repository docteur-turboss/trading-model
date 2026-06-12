import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockCollection = {
  insertOne: jest.fn<any>(),
  findOne: jest.fn<any>(),
  updateOne: jest.fn<any>(),
  find: jest.fn<any>(),
  createIndex: jest.fn<any>(),
};

const mockDb = {
  collection: jest.fn<any>().mockReturnValue(mockCollection),
};

jest.mock('mongodb', () => ({
  Db: jest.fn(),
  Collection: jest.fn(),
}));

import { JobRepository } from '../../../src/persistence/job-repository';
import { Job, JobStatus } from '../../../src/types/job.types';

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: 'test-type',
    payload: { foo: 'bar' },
    priority: 3,
    status: 'queued',
    assignedWorkerId: undefined,
    ackDeadline: Date.now() + 30000,
    maxRetries: 3,
    retryCount: 0,
    createdAt: new Date(),
    startedAt: undefined,
    completedAt: undefined,
    result: undefined,
    error: undefined,
    history: [],
    ...overrides,
  };
}

describe('JobRepository', () => {
  let repository: JobRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCollection.find.mockReturnValue({ toArray: jest.fn<any>() });
    repository = new JobRepository(mockDb as any);
  });

  describe('constructor', () => {
    it('should call db.collection with "jobs"', () => {
      expect(mockDb.collection).toHaveBeenCalledWith('jobs');
    });
  });

  describe('ensureIndexes', () => {
    it('should create 4 indexes', async () => {
      mockCollection.createIndex.mockResolvedValue(undefined);

      await repository.ensureIndexes();

      expect(mockCollection.createIndex).toHaveBeenCalledTimes(4);
      expect(mockCollection.createIndex).toHaveBeenCalledWith({ jobId: 1 }, { unique: true });
      expect(mockCollection.createIndex).toHaveBeenCalledWith({ status: 1 });
      expect(mockCollection.createIndex).toHaveBeenCalledWith(
        { assignedWorkerId: 1 },
        { sparse: true }
      );
      expect(mockCollection.createIndex).toHaveBeenCalledWith({ type: 1, status: 1 });
    });
  });

  describe('insert', () => {
    it('should call insertOne with a document', async () => {
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'job-1' });
      const job = makeJob();

      await repository.insert(job);

      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);
      const doc = mockCollection.insertOne.mock.calls[0][0] as any;
      expect(doc.jobId).toBe('job-1');
      expect(doc.type).toBe('test-type');
      expect(doc.payload).toEqual({ foo: 'bar' });
      expect(doc.priority).toBe(3);
      expect(doc.status).toBe('queued');
    });

    it('should map history entries correctly', async () => {
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'job-1' });
      const job = makeJob({
        history: [
          {
            fromStatus: 'pending',
            toStatus: 'queued',
            timestamp: new Date('2025-01-01'),
            reason: 'submitted',
          },
        ],
      });

      await repository.insert(job);

      const doc = mockCollection.insertOne.mock.calls[0][0] as any;
      expect(doc.history).toHaveLength(1);
      expect(doc.history[0].fromStatus).toBe('pending');
      expect(doc.history[0].toStatus).toBe('queued');
    });
  });

  describe('findById', () => {
    it('should return null when not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
      expect(mockCollection.findOne).toHaveBeenCalledWith({ jobId: 'nonexistent' });
    });

    it('should return a Job when found', async () => {
      const doc = {
        jobId: 'job-1',
        type: 'test-type',
        payload: { foo: 'bar' },
        priority: 3,
        status: 'queued',
        assignedWorkerId: 'worker-1',
        ackDeadline: 12345,
        maxRetries: 3,
        retryCount: 1,
        createdAt: new Date('2025-01-01'),
        startedAt: new Date('2025-01-02'),
        completedAt: undefined,
        result: { data: 'ok' },
        error: undefined,
        history: [
          {
            fromStatus: 'pending',
            toStatus: 'queued',
            timestamp: new Date('2025-01-01T00:00:00Z'),
            reason: 'submitted',
          },
        ],
      };
      mockCollection.findOne.mockResolvedValue(doc);

      const result = await repository.findById('job-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('job-1');
      expect(result!.type).toBe('test-type');
      expect(result!.priority).toBe(3);
      expect(result!.status).toBe('queued');
      expect(result!.ackDeadline).toBe(12345);
      expect(result!.retryCount).toBe(1);
      expect(result!.assignedWorkerId).toBe('worker-1');
      expect(result!.startedAt).toBeInstanceOf(Date);
      expect(result!.result).toEqual({ data: 'ok' });
      expect(result!.history).toHaveLength(1);
      expect(result!.history[0].fromStatus).toBe('pending');
      expect(result!.history[0].toStatus).toBe('queued');
    });
  });

  describe('updateStatus', () => {
    beforeEach(() => {
      const currentDoc = {
        jobId: 'job-1',
        type: 'test-type',
        payload: {},
        priority: 3,
        status: 'queued',
        assignedWorkerId: undefined,
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
      };
      mockCollection.findOne.mockResolvedValue(currentDoc);
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
    });

    it('should do nothing when job is not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      await repository.updateStatus('nonexistent', 'running');

      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });

    it('should set startedAt when status is running', async () => {
      await repository.updateStatus('job-1', 'running');

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { jobId: 'job-1' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'running', startedAt: expect.any(Date) }),
        })
      );
    });

    it('should set completedAt when status is completed', async () => {
      await repository.updateStatus('job-1', 'completed');

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { jobId: 'job-1' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'completed', completedAt: expect.any(Date) }),
        })
      );
    });

    it('should set completedAt when status is failed', async () => {
      await repository.updateStatus('job-1', 'failed');

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { jobId: 'job-1' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'failed', completedAt: expect.any(Date) }),
        })
      );
    });

    it('should not set startedAt or completedAt for queued status', async () => {
      await repository.updateStatus('job-1', 'queued');

      const $set = (mockCollection.updateOne.mock.calls[0][1] as any).$set;
      expect($set.startedAt).toBeUndefined();
      expect($set.completedAt).toBeUndefined();
    });

    it('should pass extras to $set', async () => {
      const extras = {
        result: { data: 'ok' },
        error: 'something failed',
        assignedWorkerId: 'worker-1',
        ackDeadline: 99999,
      };

      await repository.updateStatus('job-1', 'failed', extras);

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { jobId: 'job-1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            result: { data: 'ok' },
            error: 'something failed',
            assignedWorkerId: 'worker-1',
            ackDeadline: 99999,
          }),
        })
      );
    });

    it('should push history entry with fromStatus, toStatus, timestamp and reason', async () => {
      await repository.updateStatus('job-1', 'running', { error: 'n/a' });

      const $push = (mockCollection.updateOne.mock.calls[0][1] as any).$push;
      expect($push.history.fromStatus).toBe('queued');
      expect($push.history.toStatus).toBe('running');
      expect($push.history.timestamp).toBeInstanceOf(Date);
      expect($push.history.reason).toBe('n/a');
    });
  });

  describe('incrementRetry', () => {
    it('should call updateOne with $inc retryCount', async () => {
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await repository.incrementRetry('job-1');

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { jobId: 'job-1' },
        { $inc: { retryCount: 1 } }
      );
    });
  });

  describe('findNonTerminal', () => {
    it('should query with $nin statuses', async () => {
      const docs = [
        {
          jobId: 'j1',
          type: 't',
          payload: {},
          priority: 3,
          status: 'queued',
          ackDeadline: 0,
          maxRetries: 3,
          retryCount: 0,
          createdAt: new Date(),
          history: [],
        },
        {
          jobId: 'j2',
          type: 't',
          payload: {},
          priority: 3,
          status: 'running',
          ackDeadline: 0,
          maxRetries: 3,
          retryCount: 0,
          createdAt: new Date(),
          history: [],
        },
      ];
      const toArray = jest.fn<any>().mockResolvedValue(docs);
      mockCollection.find.mockReturnValue({ toArray });

      const results = await repository.findNonTerminal();

      expect(mockCollection.find).toHaveBeenCalledWith({
        status: { $nin: ['completed', 'failed', 'cancelled'] },
      });
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('j1');
      expect(results[1].status).toBe('running');
    });
  });

  describe('findByWorker', () => {
    it('should query with assignedWorkerId and $in statuses', async () => {
      const docs = [
        {
          jobId: 'j1',
          type: 't',
          payload: {},
          priority: 3,
          status: 'running',
          ackDeadline: 0,
          maxRetries: 3,
          retryCount: 0,
          createdAt: new Date(),
          history: [],
        },
      ];
      const toArray = jest.fn<any>().mockResolvedValue(docs);
      mockCollection.find.mockReturnValue({ toArray });

      const results = await repository.findByWorker('worker-1', ['assigned', 'running']);

      expect(mockCollection.find).toHaveBeenCalledWith({
        assignedWorkerId: 'worker-1',
        status: { $in: ['assigned', 'running'] },
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('j1');
    });
  });

  describe('findByStatus', () => {
    it('should query by status', async () => {
      const docs = [
        {
          jobId: 'j1',
          type: 't',
          payload: {},
          priority: 3,
          status: 'queued',
          ackDeadline: 0,
          maxRetries: 3,
          retryCount: 0,
          createdAt: new Date(),
          history: [],
        },
      ];
      const toArray = jest.fn<any>().mockResolvedValue(docs);
      mockCollection.find.mockReturnValue({ toArray });

      const results = await repository.findByStatus('queued');

      expect(mockCollection.find).toHaveBeenCalledWith({ status: 'queued' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('j1');
    });
  });
});
