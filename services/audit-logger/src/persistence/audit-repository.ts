import { Collection, Db, Filter } from 'mongodb';

import { AppError, ErrorCodes } from '@trading-model/common/utils/errors';

export interface AuditEventDocument {
  receivedAt: Date;
  metadata: {
    topic: string;
    eventType: string;
    publisher: string;
    instanceId: string;
    messageId: string;
    correlationId?: string;
  };
  payload: unknown;
}

export interface AuditEventQuery {
  topic?: string;
  publisher?: string;
  correlationId?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AuditStats {
  totalEvents: number;
  eventsByTopic: Record<string, number>;
  eventsByPublisher: Record<string, number>;
  dateRange: {
    earliest: Date | null;
    latest: Date | null;
  };
}

const COLLECTION = 'audit_events';

export class AuditRepository {
  private readonly collection: Collection<AuditEventDocument>;

  constructor(db: Db) {
    this.collection = db.collection<AuditEventDocument>(COLLECTION);
  }

  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ 'metadata.correlationId': 1 });
    await this.collection.createIndex({ 'metadata.publisher': 1, receivedAt: -1 });
    await this.collection.createIndex({ 'metadata.topic': 1, receivedAt: -1 });
    await this.collection.createIndex({ receivedAt: -1 });
  }

  async insert(event: AuditEventDocument): Promise<void> {
    try {
      await this.collection.insertOne(event);
    } catch (err) {
      throw new AppError('Failed to persist audit event', ErrorCodes.AGENT_ERROR, {
        cause: err,
      });
    }
  }

  async insertBatch(events: AuditEventDocument[]): Promise<void> {
    if (events.length === 0) return;
    try {
      await this.collection.insertMany(events, { ordered: false });
    } catch (err) {
      throw new AppError('Failed to persist audit event batch', ErrorCodes.AGENT_ERROR, {
        cause: err,
      });
    }
  }

  async findById(messageId: string): Promise<AuditEventDocument | null> {
    return this.collection.findOne({ 'metadata.messageId': messageId });
  }

  async query(query: AuditEventQuery): Promise<PaginatedResult<AuditEventDocument>> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 100, 1000);
    const skip = (page - 1) * limit;

    const filter: Filter<AuditEventDocument> = {};

    if (query.topic) {
      filter['metadata.topic'] = query.topic;
    }
    if (query.publisher) {
      filter['metadata.publisher'] = query.publisher;
    }
    if (query.correlationId) {
      filter['metadata.correlationId'] = query.correlationId;
    }
    if (query.startDate || query.endDate) {
      filter.receivedAt = {};
      if (query.startDate) {
        filter.receivedAt.$gte = query.startDate;
      }
      if (query.endDate) {
        filter.receivedAt.$lte = query.endDate;
      }
    }

    const [data, total] = await Promise.all([
      this.collection.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limit).toArray(),
      this.collection.countDocuments(filter),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getStats(): Promise<AuditStats> {
    const [totalEvents, topicAgg, publisherAgg, dateRange] = await Promise.all([
      this.collection.estimatedDocumentCount(),
      this.collection
        .aggregate<{
          _id: string;
          count: number;
        }>([{ $group: { _id: '$metadata.topic', count: { $sum: 1 } } }])
        .toArray(),
      this.collection
        .aggregate<{
          _id: string;
          count: number;
        }>([{ $group: { _id: '$metadata.publisher', count: { $sum: 1 } } }])
        .toArray(),
      this.collection
        .aggregate<{ earliest: Date | null; latest: Date | null }>([
          {
            $group: {
              _id: null,
              earliest: { $min: '$receivedAt' },
              latest: { $max: '$receivedAt' },
            },
          },
        ])
        .toArray(),
    ]);

    return {
      totalEvents,
      eventsByTopic: Object.fromEntries(topicAgg.map(t => [t._id, t.count])),
      eventsByPublisher: Object.fromEntries(publisherAgg.map(p => [p._id, p.count])),
      dateRange: {
        earliest: dateRange[0]?.earliest ?? null,
        latest: dateRange[0]?.latest ?? null,
      },
    };
  }
}
