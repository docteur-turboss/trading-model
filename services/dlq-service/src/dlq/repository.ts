import { createHash } from 'node:crypto';

import { ObjectId } from 'mongodb';

import { getCollection } from '../config/db';
import { env } from '../config/env';

export class DlqCapacityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DlqCapacityError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface DlqEntry {
  id?: string;
  topic?: string;
  message: unknown;
  reason?: string;
  deliveryAttempt: number;
  timestamp: string;
  messageId?: string;
}

export type DlqStatus = 'completed' | 'abandoned';

export const DLQ_STATUS: Record<DlqStatus, DlqStatus> = {
  completed: 'completed',
  abandoned: 'abandoned',
};

const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

export interface StoredDlqEntry {
  id: string;
  topic: string | null;
  message: unknown;
  reason: string | null;
  deliveryAttempt: number;
  createdAt: string;
}

const DLQ_MAX_PASS_COUNT = 3;

export class DlqRepository {
  async add(entry: DlqEntry): Promise<string> {
    const col = await getCollection();

    const currentCount = await col.estimatedDocumentCount();
    if (currentCount >= env.MAX_ENTRIES) {
      throw new DlqCapacityError('DLQ capacity limit reached');
    }

    const serialized = JSON.stringify({
      topic: entry.topic,
      message: entry.message,
      reason: entry.reason,
    });

    const messageId = entry.messageId ?? createHash('sha256')
      .update(serialized)
      .digest('hex');

    const contentHash = createHash('sha256').update(serialized).digest('hex');

    const prevCompleted = await col.findOne(
      { contentHash, status: { $in: [DLQ_STATUS.completed, DLQ_STATUS.abandoned] } },
      { sort: { createdAt: -1 }, projection: { dlqPassCount: 1, _id: 1 } }
    );
    const dlqPassCount = (prevCompleted?.dlqPassCount ?? 0) + 1;

    const doc: Record<string, unknown> = {
      messageId,
      contentHash,
      topic: entry.topic ?? null,
      message: entry.message,
      reason: entry.reason ?? null,
      deliveryAttempt: entry.deliveryAttempt,
      retryCount: 0,
      dlqPassCount,
      createdAt: new Date(entry.timestamp),
    };

    if (dlqPassCount >= DLQ_MAX_PASS_COUNT) {
      doc.status = DLQ_STATUS.abandoned;
      doc.abandonedAt = new Date();
      doc.lastError = `Ping-pong detected: message entered DLQ ${dlqPassCount} times`;
    }

    const existing = await col.findOne({ messageId }, { projection: { _id: 1 } });
    if (existing) return existing._id.toHexString();

    try {
      const result = await col.insertOne(doc);
      return result.insertedId.toHexString();
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && (err as Record<string, unknown>).code === 11000) {
        const existingAfterRace = await col.findOne({ messageId }, { projection: { _id: 1 } });
        return existingAfterRace!._id.toHexString();
      }
      throw err;
    }
  }

  async list(topic?: string, limit = 100, offset = 0, before?: string): Promise<StoredDlqEntry[]> {
    const col = await getCollection();
    const query: Record<string, unknown> = {};
    if (topic) query.topic = topic;
    if (before && ObjectId.isValid(before)) {
      query._id = { $lt: new ObjectId(before) };
    }

    const docs = await col
      .find(query, { sort: { createdAt: -1 }, skip: before ? 0 : offset, limit: Math.min(limit, 1000) })
      .toArray();

    return docs.map(d => ({
      id: d._id.toHexString(),
      topic: d.topic ?? null,
      message: d.message,
      reason: d.reason ?? null,
      deliveryAttempt: d.deliveryAttempt,
      createdAt: d.createdAt?.toISOString() ?? new Date().toISOString(),
    }));
  }

  async delete(ids: string[]): Promise<number> {
    const col = await getCollection();
    const objectIds = ids
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id));
    if (objectIds.length === 0) return 0;
    const result = await col.deleteMany({
      _id: { $in: objectIds },
      processingAt: { $exists: false },
    });
    return result.deletedCount;
  }

  async count(): Promise<number> {
    const col = await getCollection();
    return col.estimatedDocumentCount();
  }

  async prune(maxEntries: number): Promise<number> {
    const col = await getCollection();
    const docs = await col
      .find({}, { sort: { createdAt: -1 }, skip: maxEntries, limit: 1, projection: { createdAt: 1 } })
      .toArray();
    if (docs.length === 0) return 0;
    const eldestToKeep = docs[0].createdAt;
    const result = await col.deleteMany({ createdAt: { $lt: eldestToKeep }, processingAt: { $exists: false } });
    return result.deletedCount;
  }

  async claimEntriesForRetry(limit = 50, batchId: string, instanceId: string, topic?: string): Promise<StoredDlqEntry[]> {
    const col = await getCollection();
    const statusFilter: Record<string, unknown> = { $nin: [DLQ_STATUS.completed, DLQ_STATUS.abandoned] };
    const filter: Record<string, unknown> = {
      retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
      processingAt: { $exists: false },
      status: statusFilter,
      consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
    };
    if (topic) filter.topic = topic;

    const candidates = await col.find(filter, {
      sort: { createdAt: -1 },
      limit,
      projection: { _id: 1, topic: 1, message: 1, reason: 1, deliveryAttempt: 1, createdAt: 1 },
    }).toArray();

    if (candidates.length === 0) return [];

    const now = new Date();
    const atomicCond: Record<string, unknown> = {
      retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
      processingAt: { $exists: false },
      status: statusFilter,
      consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
    };

    const operations = candidates.map(doc => ({
      updateOne: {
        filter: { _id: doc._id, ...atomicCond },
        update: {
          $set: {
            processingAt: now,
            processingInstance: instanceId,
            lastBatchId: batchId,
          },
        },
      },
    }));

    const bulkResult = await col.bulkWrite(operations, { ordered: false });
    if (bulkResult.modifiedCount === 0) return [];

    const candidateIds = candidates.map(d => d._id);
    const claimedDocs = await col.find(
      { _id: { $in: candidateIds }, lastBatchId: batchId },
      { projection: { _id: 1, topic: 1, message: 1, reason: 1, deliveryAttempt: 1, createdAt: 1 } }
    ).toArray();

    return claimedDocs.map(d => ({
      id: d._id.toHexString(),
      topic: d.topic ?? null,
      message: d.message,
      reason: d.reason ?? null,
      deliveryAttempt: d.deliveryAttempt,
      createdAt: d.createdAt?.toISOString() ?? new Date().toISOString(),
    }));
  }

  async releaseStaleClaims(staleThresholdMs = 60_000): Promise<number> {
    const col = await getCollection();
    const staleThreshold = new Date(Date.now() - staleThresholdMs);
    const result = await col.updateMany(
      { processingAt: { $lt: staleThreshold } },
      { $unset: { processingAt: '', processingInstance: '' } }
    );
    return result.modifiedCount;
  }

  async releaseAllActiveClaims(): Promise<number> {
    const col = await getCollection();
    const result = await col.updateMany(
      { processingAt: { $exists: true } },
      { $unset: { processingAt: '', processingInstance: '' } }
    );
    return result.modifiedCount;
  }

  async releaseClaimsByInstance(instanceId: string): Promise<number> {
    const col = await getCollection();
    const result = await col.updateMany(
      { processingInstance: instanceId },
      { $unset: { processingAt: '', processingInstance: '' } }
    );
    return result.modifiedCount;
  }

  async claimEntriesByIds(ids: string[], batchId: string, instanceId: string): Promise<StoredDlqEntry[]> {
    if (ids.length === 0) return [];
    const col = await getCollection();
    const objectIds = ids.filter(id => ObjectId.isValid(id)).map(id => new ObjectId(id));
    if (objectIds.length === 0) return [];

    const now = new Date();
    const atomicCond: Record<string, unknown> = {
      retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
      processingAt: { $exists: false },
      status: { $nin: [DLQ_STATUS.completed, DLQ_STATUS.abandoned] },
      consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
    };

    const operations = objectIds.map(id => ({
      updateOne: {
        filter: { _id: id, ...atomicCond },
        update: {
          $set: { processingAt: now, processingInstance: instanceId, lastBatchId: batchId },
        },
      },
    }));

    await col.bulkWrite(operations, { ordered: false });

    const claimed = await col.find(
      { _id: { $in: objectIds }, lastBatchId: batchId },
      { projection: { _id: 1, topic: 1, message: 1, reason: 1, deliveryAttempt: 1, createdAt: 1 } }
    ).toArray();

    return claimed.map(d => ({
      id: d._id.toHexString(),
      topic: d.topic ?? null,
      message: d.message,
      reason: d.reason ?? null,
      deliveryAttempt: d.deliveryAttempt,
      createdAt: d.createdAt?.toISOString() ?? new Date().toISOString(),
    }));
  }

  async claimEntry(id: string, batchId: string, instanceId: string): Promise<StoredDlqEntry | null> {
    const col = await getCollection();
    const result = await col.findOneAndUpdate(
      {
        _id: new ObjectId(id),
        retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
        processingAt: { $exists: false },
        status: { $nin: [DLQ_STATUS.completed, DLQ_STATUS.abandoned] },
        consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
      },
      {
        $set: {
          processingAt: new Date(),
          processingInstance: instanceId,
          lastBatchId: batchId,
        },
      },
      { returnDocument: 'after', projection: { _id: 1, topic: 1, message: 1, reason: 1, deliveryAttempt: 1, createdAt: 1 } }
    );
    if (!result) return null;
    return {
      id: result._id.toHexString(),
      topic: result.topic ?? null,
      message: result.message,
      reason: result.reason ?? null,
      deliveryAttempt: result.deliveryAttempt,
      createdAt: result.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  async releaseClaimWithoutCount(id: string): Promise<void> {
    const col = await getCollection();
    const filter: Record<string, unknown> = { _id: new ObjectId(id) };
    await col.updateOne(
      filter,
      {
        $unset: { processingAt: '', processingInstance: '' },
      }
    );
  }

  async abandonExhaustedEntries(): Promise<number> {
    const col = await getCollection();
    const result = await col.updateMany(
      {
        status: { $ne: DLQ_STATUS.abandoned },
        processingAt: { $exists: false },
        $or: [
          { retryCount: { $gte: env.DLQ_RETRY_MAX_ATTEMPTS } },
          { consecutiveErrors: { $gte: DLQ_MAX_CONSECUTIVE_ERRORS } },
        ],
      },
      { $set: { status: DLQ_STATUS.abandoned, abandonedAt: new Date() } }
    );
    return result.modifiedCount;
  }

  async markRetried(id: string, instanceId: string, batchId?: string, success = true, errorMsg?: string): Promise<void> {
    const col = await getCollection();
    if (success) {
      const entry = await col.findOne({ _id: new ObjectId(id) }, { projection: { status: 1, processingInstance: 1 } });
      if (entry?.status === DLQ_STATUS.abandoned) {
        return;
      }
      await col.updateOne(
        { _id: new ObjectId(id), processingInstance: instanceId },
        {
          $set: { status: DLQ_STATUS.completed, completedAt: new Date(), lastBatchId: batchId },
          $unset: { processingAt: '', processingInstance: '' },
        }
      );
      return;
    }

    const failFilter: Record<string, unknown> = {
      _id: new ObjectId(id),
      retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
    };
    const updated = await col.findOneAndUpdate(
      failFilter,
      [
        {
          $set: {
            consecutiveErrors: {
              $cond: {
                if: { $eq: ['$lastError', errorMsg ?? 'Replay failed'] },
                then: { $add: [{ $ifNull: ['$consecutiveErrors', 0] }, 1] },
                else: 1,
              },
            },
          },
        },
        {
          $set: {
            retryCount: { $add: ['$retryCount', 1] },
            lastRetryAt: new Date(),
            lastError: errorMsg ?? 'Replay failed',
          },
        },
        {
          $set: {
            status: {
              $cond: {
                if: {
                  $or: [
                    { $gte: ['$retryCount', env.DLQ_RETRY_MAX_ATTEMPTS] },
                    { $gte: ['$consecutiveErrors', DLQ_MAX_CONSECUTIVE_ERRORS] },
                  ],
                },
                then: DLQ_STATUS.abandoned,
                else: '$$REMOVE',
              },
            },
            abandonedAt: {
              $cond: {
                if: {
                  $or: [
                    { $gte: ['$retryCount', env.DLQ_RETRY_MAX_ATTEMPTS] },
                    { $gte: ['$consecutiveErrors', DLQ_MAX_CONSECUTIVE_ERRORS] },
                  ],
                },
                then: new Date(),
                else: '$$REMOVE',
              },
            },
          },
        },
        { $unset: ['processingAt', 'processingInstance'] },
      ],
      { returnDocument: 'after', projection: { _id: 1 } }
    );

    if (!updated) {
      await col.updateOne(
        { _id: new ObjectId(id) },
        { $unset: { processingAt: '', processingInstance: '' } }
      );
    }
  }

  async listQueuable(): Promise<string[]> {
    const col = await getCollection();
    const docs = await col.find(
      {
        retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
        processingAt: { $exists: false },
        status: { $nin: [DLQ_STATUS.completed, DLQ_STATUS.abandoned] },
        consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
      },
      {
        sort: { createdAt: -1 },
        limit: env.DLQ_AUTO_RETRY_LIMIT * 10,
        projection: { _id: 1 },
      }
    ).toArray();
    return docs.map(d => d._id.toHexString());
  }

  async listActiveClaimIds(): Promise<string[]> {
    const col = await getCollection();
    const docs = await col.find(
      {
        processingAt: { $exists: true },
        status: { $nin: [DLQ_STATUS.completed, DLQ_STATUS.abandoned] },
      },
      { projection: { _id: 1 } }
    ).toArray();
    return docs.map(d => d._id.toHexString());
  }

  async incrementRetryCount(id: string): Promise<boolean> {
    const col = await getCollection();
    const result = await col.updateOne(
      { _id: new ObjectId(id) },
      { $inc: { retryCount: 1 } }
    );
    return result.modifiedCount > 0;
  }
}

export const dlqRepository = new DlqRepository();
