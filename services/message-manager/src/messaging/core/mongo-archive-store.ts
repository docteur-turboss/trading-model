import { Message } from '@trading-model/common/contracts/message.types';

import { messageStore } from './message-store.js';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

interface ArchiveEntry {
  messageId: string;
  topic: string;
  eventType: string;
  producer: string;
  payload: unknown;
  metadata: Record<string, unknown>;
  archivedAt: Date;
  ttl: Date;
}

interface MongoClient {
  db: (name: string) => {
    collection: (name: string) => {
      insertMany: (docs: unknown[]) => Promise<unknown>;
      createIndex: (
        keys: Record<string, number>,
        opts?: Record<string, unknown>
      ) => Promise<string>;
      countDocuments: (filter: Record<string, unknown>) => Promise<number>;
      deleteMany: (filter: Record<string, unknown>) => Promise<{ deletedCount: number }>;
      bulkWrite: (ops: unknown[]) => Promise<unknown>;
    };
  };
  close: () => Promise<void>;
}

export class MongoArchiveStore {
  private client: MongoClient | null = null;
  private archiveTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private topicsCache: string[] = [];
  private topicsCacheTimer: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    if (!env.MONGO_ARCHIVE_URI) {
      logger.info('MongoDB archival not configured — skipping');
      return;
    }
    if (this.started) return;
    this.started = true;

    try {
      const { MongoClient } = await import('mongodb');
      this.client = new MongoClient(env.MONGO_ARCHIVE_URI) as unknown as MongoClient;
      await (this.client as unknown as { connect: () => Promise<void> }).connect();
      logger.info('MongoDB archival store connected');

      await this.ensureIndexes();
      this.startArchiveTimer();
      this.startTopicsCacheRefresh();
    } catch (err) {
      logger.warn('MongoDB archival store failed to start — continuing without archival', {
        error: (err as Error).message,
      });
      this.client = null;
    }
  }

  private async ensureIndexes(): Promise<void> {
    if (!this.client) return;
    try {
      const col = this.client.db(env.MONGO_ARCHIVE_DB).collection(env.MONGO_ARCHIVE_COLLECTION);
      await col.createIndex({ messageId: 1 }, { unique: true, background: true });
      await col.createIndex({ topic: 1, archivedAt: -1 }, { background: true });
      await col.createIndex({ ttl: 1 }, { expireAfterSeconds: 0, background: true });
      logger.info('MongoDB archive indexes ensured');
    } catch (err) {
      logger.warn('Failed to create archive indexes', { error: (err as Error).message });
    }
  }

  private startTopicsCacheRefresh(): void {
    this.topicsCacheTimer = setInterval(async () => {
      try {
        const { getSubscriptionClient } = await import('../../config/redis.js');
        const redis = await getSubscriptionClient();
        const topics = await redis.smembers(`${env.REDIS_PREFIX}topics`);
        this.topicsCache = topics;
      } catch {
        // best-effort
      }
    }, 30_000);
    this.topicsCacheTimer.unref();
  }

  private startArchiveTimer(): void {
    this.archiveTimer = setInterval(() => {
      this.archiveBatch().catch(err => {
        logger.warn('MongoDB archive batch failed', { error: (err as Error).message });
      });
    }, env.MONGO_ARCHIVE_INTERVAL_MS);
    this.archiveTimer.unref();
  }

  private async archiveBatch(): Promise<void> {
    if (!this.client) return;

    const topics = this.topicsCache;
    if (topics.length === 0) return;

    for (const topic of topics) {
      try {
        const messages = await messageStore.getMessagesAfter(
          topic,
          Date.now() - 3600_000,
          env.MONGO_ARCHIVE_BATCH_SIZE
        );
        if (messages.length === 0) continue;

        const entries: ArchiveEntry[] = messages.map((msg: Message) => ({
          messageId: msg.metadata.messageId ?? '',
          topic: msg.metadata.topic,
          eventType: msg.metadata.eventType,
          producer: msg.metadata.publisher?.serviceName ?? 'unknown',
          payload: msg.payload,
          metadata: msg.metadata as unknown as Record<string, unknown>,
          archivedAt: new Date(),
          ttl: new Date(Date.now() + env.MONGO_ARCHIVE_RETENTION_DAYS * 86400_000),
        }));

        const col = this.client.db(env.MONGO_ARCHIVE_DB).collection(env.MONGO_ARCHIVE_COLLECTION);
        const bulkOps = entries
          .filter(e => e.messageId)
          .map(e => ({
            updateOne: {
              filter: { messageId: e.messageId },
              update: { $setOnInsert: e },
              upsert: true,
            },
          }));

        if (bulkOps.length > 0) {
          await col.bulkWrite(bulkOps);
        }
      } catch {
        // continue to next topic
      }
    }
  }

  async stop(): Promise<void> {
    if (this.archiveTimer) {
      clearInterval(this.archiveTimer);
      this.archiveTimer = null;
    }
    if (this.topicsCacheTimer) {
      clearInterval(this.topicsCacheTimer);
      this.topicsCacheTimer = null;
    }
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // best-effort
      }
      this.client = null;
    }
    this.started = false;
  }
}

export const mongoArchiveStore = new MongoArchiveStore();
