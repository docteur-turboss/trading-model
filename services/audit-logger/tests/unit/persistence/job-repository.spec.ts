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
import { Job } from '../../../src/types/job.types';

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
    it('should call db.collection with "audit_jobs"', () => {
      expect(mockDb.collection).toHaveBeenCalledWith('audit_jobs');
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
      const doc = (mockCollection.insertOne as jest.Mock).mock.calls[0][0] as any;
      expect(doc.jobId).toBe('job-1');
      expect(doc.type).toBe('test-type');
    });

    it('should map history entries in toDocument', async () => {
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'job-1' });
      const job = makeJob({
        history: [
          {
            fromStatus: 'queued',
            toStatus: 'assigned',
            timestamp: new Date('2024-01-01'),
            reason: 'assign',
          },
          {
            fromStatus: 'assigned',
            toStatus: 'running',
            timestamp: new Date('2024-01-02'),
            reason: 'start',
          },
        ],
      });

      await repository.insert(job);

      const doc = (mockCollection.insertOne as jest.Mock).mock.calls[0][0] as any;
      expect(doc.history).toHaveLength(2);
      expect(doc.history[0]).toMatchObject({
        fromStatus: 'queued',
        toStatus: 'assigned',
        reason: 'assign',
      });
      expect(doc.history[1]).toMatchObject({
        fromStatus: 'assigned',
        toStatus: 'running',
        reason: 'start',
      });
    });
  });

  describe('findById', () => {
    it('should return a job when found', async () => {
      const doc = {
        jobId: 'job-1',
        type: 'test',
        payload: {},
        priority: 3,
        status: 'queued',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [],
      };
      mockCollection.findOne.mockResolvedValue(doc);

      const result = await repository.findById('job-1');

      expect(mockCollection.findOne).toHaveBeenCalledWith({ jobId: 'job-1' });
      expect(result).toBeDefined();
      expect(result!.id).toBe('job-1');
    });

    it('should return null when not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');

      expect(result).toBeNull();
    });

    it('should map history entries in fromDocument', async () => {
      const doc = {
        jobId: 'job-1',
        type: 'test',
        payload: {},
        priority: 3,
        status: 'queued',
        ackDeadline: 0,
        maxRetries: 3,
        retryCount: 0,
        createdAt: new Date(),
        history: [
          {
            fromStatus: 'queued',
            toStatus: 'assigned',
            timestamp: new Date('2024-01-01'),
            reason: 'assign',
          },
        ],
      };
      mockCollection.findOne.mockResolvedValue(doc);

      const result = await repository.findById('job-1');

      expect(result!.history).toHaveLength(1);
      expect(result!.history[0]).toMatchObject({
        fromStatus: 'queued',
        toStatus: 'assigned',
        reason: 'assign',
      });
    });
  });

  describe('updateStatus', () => {
    it('should update status and push history', async () => {
      const currentDoc = { jobId: 'job-1', status: 'queued', history: [] };
      mockCollection.findOne.mockResolvedValue(currentDoc);
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await repository.updateStatus('job-1', 'assigned', {
        assignedWorkerId: 'w1',
        ackDeadline: 1000,
      });

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { jobId: 'job-1' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'assigned',
            assignedWorkerId: 'w1',
            ackDeadline: 1000,
          }),
          $push: expect.objectContaining({
            history: expect.objectContaining({
              fromStatus: 'queued',
              toStatus: 'assigned',
            }),
          }),
        })
      );
    });

    it('should do nothing when current document is not found', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      await repository.updateStatus('nonexistent', 'completed');

      expect(mockCollection.updateOne).not.toHaveBeenCalled();
    });

    it('should set startedAt when status becomes running', async () => {
      const currentDoc = { jobId: 'job-1', status: 'assigned', history: [] };
      mockCollection.findOne.mockResolvedValue(currentDoc);
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await repository.updateStatus('job-1', 'running');

      const updateCall = (mockCollection.updateOne as jest.Mock).mock.calls[0][1] as any;
      expect(updateCall.$set.startedAt).toBeDefined();
      expect(updateCall.$set.startedAt).toBeInstanceOf(Date);
    });

    it('should set completedAt when status becomes completed or failed', async () => {
      const currentDoc = { jobId: 'job-1', status: 'running', history: [] };
      mockCollection.findOne.mockResolvedValue(currentDoc);
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await repository.updateStatus('job-1', 'completed', { result: 'success' });

      const updateCall = (mockCollection.updateOne as jest.Mock).mock.calls[0][1] as any;
      expect(updateCall.$set.completedAt).toBeDefined();
      expect(updateCall.$set.completedAt).toBeInstanceOf(Date);
      expect(updateCall.$set.result).toBe('success');
    });

    it('should set error when extras.error is provided', async () => {
      const currentDoc = { jobId: 'job-1', status: 'running', history: [] };
      mockCollection.findOne.mockResolvedValue(currentDoc);
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await repository.updateStatus('job-1', 'failed', { error: 'Something went wrong' });

      const updateCall = (mockCollection.updateOne as jest.Mock).mock.calls[0][1] as any;
      expect(updateCall.$set.error).toBe('Something went wrong');
      expect(updateCall.$set.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('incrementRetry', () => {
    it('should increment retryCount by 1', async () => {
      mockCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

      await repository.incrementRetry('job-1');

      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { jobId: 'job-1' },
        { $inc: { retryCount: 1 } }
      );
    });
  });

  describe('findNonTerminal', () => {
    it('should find all non-terminal jobs', async () => {
      const docs = [
        { jobId: 'j1', status: 'queued', history: [] },
        { jobId: 'j2', status: 'running', history: [] },
      ];
      mockCollection.find.mockReturnValue({ toArray: jest.fn<any>().mockResolvedValue(docs) });

      const results = await repository.findNonTerminal();

      expect(mockCollection.find).toHaveBeenCalledWith({
        status: { $nin: ['completed', 'failed', 'cancelled'] },
      });
      expect(results).toHaveLength(2);
    });
  });

  describe('findByWorker', () => {
    it('should find jobs by worker ID and statuses', async () => {
      const docs = [{ jobId: 'j1', assignedWorkerId: 'w1', status: 'assigned', history: [] }];
      mockCollection.find.mockReturnValue({ toArray: jest.fn<any>().mockResolvedValue(docs) });

      const results = await repository.findByWorker('w1', ['assigned', 'running']);

      expect(mockCollection.find).toHaveBeenCalledWith({
        assignedWorkerId: 'w1',
        status: { $in: ['assigned', 'running'] },
      });
      expect(results).toHaveLength(1);
    });
  });

  describe('findByStatus', () => {
    it('should find jobs by status', async () => {
      const docs = [{ jobId: 'j1', status: 'queued', history: [] }];
      mockCollection.find.mockReturnValue({ toArray: jest.fn<any>().mockResolvedValue(docs) });

      const results = await repository.findByStatus('queued');

      expect(mockCollection.find).toHaveBeenCalledWith({ status: 'queued' });
      expect(results).toHaveLength(1);
    });
  });
});
