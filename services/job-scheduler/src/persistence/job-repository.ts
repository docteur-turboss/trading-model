import { Collection, Db } from 'mongodb';

import { Job, JobStatus } from '../types/job.types';

const COLLECTION = 'jobs';

interface JobDocument {
  jobId: string;
  type: string;
  payload: unknown;
  priority: number;
  status: string;
  assignedWorkerId?: string;
  ackDeadline: number;
  maxRetries: number;
  retryCount: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: unknown;
  error?: string;
  history: Array<{ fromStatus: string; toStatus: string; timestamp: Date; reason: string }>;
}

function toDocument(job: Job): JobDocument {
  return {
    jobId: job.id,
    type: job.type,
    payload: job.payload,
    priority: job.priority,
    status: job.status,
    assignedWorkerId: job.assignedWorkerId,
    ackDeadline: job.ackDeadline,
    maxRetries: job.maxRetries,
    retryCount: job.retryCount,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    result: job.result,
    error: job.error,
    history: job.history.map(e => ({
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      timestamp: e.timestamp,
      reason: e.reason,
    })),
  };
}

function fromDocument(doc: JobDocument): Job {
  return {
    id: doc.jobId,
    type: doc.type,
    payload: doc.payload as Job['payload'],
    priority: doc.priority as 1 | 2 | 3 | 4 | 5,
    status: doc.status as JobStatus,
    assignedWorkerId: doc.assignedWorkerId,
    ackDeadline: doc.ackDeadline,
    maxRetries: doc.maxRetries,
    retryCount: doc.retryCount,
    createdAt: doc.createdAt,
    startedAt: doc.startedAt,
    completedAt: doc.completedAt,
    result: doc.result,
    error: doc.error,
    history: doc.history.map(e => ({
      fromStatus: e.fromStatus as JobStatus,
      toStatus: e.toStatus as JobStatus,
      timestamp: e.timestamp,
      reason: e.reason,
    })),
  };
}

export class JobRepository {
  private readonly collection: Collection<JobDocument>;

  constructor(db: Db) {
    this.collection = db.collection<JobDocument>(COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ jobId: 1 }, { unique: true });
    await this.collection.createIndex({ status: 1 });
    await this.collection.createIndex({ assignedWorkerId: 1 }, { sparse: true });
    await this.collection.createIndex({ type: 1, status: 1 });
  }

  async insert(job: Job): Promise<void> {
    await this.collection.insertOne(toDocument(job));
  }

  async findById(jobId: string): Promise<Job | null> {
    const doc = await this.collection.findOne({ jobId });
    return doc ? fromDocument(doc) : null;
  }

  async updateStatus(
    jobId: string,
    status: JobStatus,
    extras?: Partial<Pick<Job, 'result' | 'error' | 'assignedWorkerId' | 'ackDeadline'>>
  ): Promise<void> {
    const current = await this.collection.findOne({ jobId });
    if (!current) return;

    const $set: Record<string, unknown> = {
      status,
      ...(status === 'running' ? { startedAt: new Date() } : {}),
      ...(status === 'completed' || status === 'failed' ? { completedAt: new Date() } : {}),
    };
    if (extras?.result !== undefined) $set.result = extras.result;
    if (extras?.error !== undefined) $set.error = extras.error;
    if (extras?.assignedWorkerId !== undefined) $set.assignedWorkerId = extras.assignedWorkerId;
    if (extras?.ackDeadline !== undefined) $set.ackDeadline = extras.ackDeadline;

    await this.collection.updateOne(
      { jobId },
      {
        $set,
        $push: {
          history: {
            fromStatus: current.status,
            toStatus: status,
            timestamp: new Date(),
            reason: extras?.error || status,
          },
        },
      }
    );
  }

  async incrementRetry(jobId: string): Promise<void> {
    await this.collection.updateOne({ jobId }, { $inc: { retryCount: 1 } });
  }

  async findNonTerminal(): Promise<Job[]> {
    const docs = await this.collection
      .find({ status: { $nin: ['completed', 'failed', 'cancelled'] } })
      .toArray();
    return docs.map(fromDocument);
  }

  async findByWorker(workerId: string, statuses: JobStatus[]): Promise<Job[]> {
    const docs = await this.collection
      .find({ assignedWorkerId: workerId, status: { $in: statuses } })
      .toArray();
    return docs.map(fromDocument);
  }

  async findByStatus(status: JobStatus): Promise<Job[]> {
    const docs = await this.collection.find({ status }).toArray();
    return docs.map(fromDocument);
  }
}
