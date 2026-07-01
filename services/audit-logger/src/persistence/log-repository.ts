import { Collection, Db } from 'mongodb';

export interface ServiceLogDocument {
  receivedAt: Date;
  ttl: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  service: {
    name: string;
    instanceId: string;
    version?: string;
  };
  module?: string;
  correlationId?: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  request?: {
    method?: string;
    url?: string;
    statusCode?: number;
    durationMs?: number;
  };
  user?: {
    id?: string;
    sessionId?: string;
  };
  environment?: string;
}

export interface LogQuery {
  serviceName?: string;
  level?: string;
  correlationId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface LogStats {
  total: number;
  byService: Record<string, number>;
  byLevel: Record<string, number>;
  dateRange: { earliest?: string; latest?: string };
}

export class LogRepository {
  private collection?: Collection<ServiceLogDocument>;

  constructor(private readonly db: Db) {}

  private async getCollection(): Promise<Collection<ServiceLogDocument>> {
    if (!this.collection) {
      this.collection = this.db.collection<ServiceLogDocument>('service_logs');
      await this.ensureIndexes();
    }
    return this.collection;
  }

  async ensureIndexes(): Promise<void> {
    const col = await this.getCollection();

    if (await this.indexExists('ttl_1')) return;

    await col.createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });
    await col.createIndex({ 'service.name': 1, receivedAt: -1 });
    await col.createIndex({ level: 1, receivedAt: -1 });
    await col.createIndex({ correlationId: 1 });
    await col.createIndex({ receivedAt: -1 });
  }

  async insert(doc: ServiceLogDocument): Promise<void> {
    const col = await this.getCollection();
    await col.insertOne(doc as never);
  }

  async insertBatch(docs: ServiceLogDocument[]): Promise<void> {
    if (docs.length === 0) return;
    const col = await this.getCollection();
    await col.insertMany(docs as never[], { ordered: false });
  }

  async query(params: LogQuery): Promise<{ docs: ServiceLogDocument[]; total: number; page: number; limit: number }> {
    const col = await this.getCollection();
    const filter: Record<string, unknown> = {};

    if (params.serviceName) filter['service.name'] = params.serviceName;
    if (params.level) filter.level = params.level;
    if (params.correlationId) filter.correlationId = params.correlationId;
    if (params.startDate || params.endDate) {
      filter.receivedAt = {} as Record<string, Date>;
      if (params.startDate) (filter.receivedAt as Record<string, Date>).$gte = new Date(params.startDate);
      if (params.endDate) (filter.receivedAt as Record<string, Date>).$lte = new Date(params.endDate);
    }
    if (params.search) {
      filter.message = { $regex: params.search, $options: 'i' };
    }

    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(1000, params.limit ?? 50);
    const skip = (page - 1) * limit;
    const total = await col.countDocuments(filter);
    const docs = await col.find(filter).sort({ receivedAt: -1 }).skip(skip).limit(limit).toArray();

    return { docs, total, page, limit };
  }

  async getStats(): Promise<LogStats> {
    const col = await this.getCollection();

    const [aggResult] = await col.aggregate([
      {
        $facet: {
          byService: [{ $group: { _id: '$service.name', count: { $sum: 1 } } }],
          byLevel: [{ $group: { _id: '$level', count: { $sum: 1 } } }],
          dateRange: [{
            $group: {
              _id: null,
              earliest: { $min: '$receivedAt' },
              latest: { $max: '$receivedAt' },
            },
          }],
          total: [{ $count: 'count' }],
        },
      },
    ]).toArray();

    const byService: Record<string, number> = {};
    for (const s of (aggResult?.byService as Array<{ _id: string; count: number }>) ?? []) {
      byService[s._id] = s.count;
    }
    const byLevel: Record<string, number> = {};
    for (const l of (aggResult?.byLevel as Array<{ _id: string; count: number }>) ?? []) {
      byLevel[l._id] = l.count;
    }
    const dr = (aggResult?.dateRange as Array<{ earliest?: Date; latest?: Date }>)?.[0];

    return {
      total: (aggResult?.total as Array<{ count: number }>)?.[0]?.count ?? 0,
      byService,
      byLevel,
      dateRange: {
        earliest: dr?.earliest?.toISOString(),
        latest: dr?.latest?.toISOString(),
      },
    };
  }

  async getById(id: string): Promise<ServiceLogDocument | null> {
    const col = await this.getCollection();
    const { ObjectId } = await import('mongodb');
    if (!ObjectId.isValid(id)) return null;
    return col.findOne({ _id: new ObjectId(id) } as never);
  }

  private async indexExists(name: string): Promise<boolean> {
    try {
      const db = this.collection ? this.db : undefined;
      if (!db) return false;
      return db.collection('service_logs').indexExists(name);
    } catch {
      return false;
    }
  }
}
