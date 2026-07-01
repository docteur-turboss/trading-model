import { MongoClient, Collection } from 'mongodb';

import { logger } from '@trading-model/common/config/logger';

import { MongoManager } from './mongo-manager';

export interface AuditEntry {
  action: 'sign' | 'revoke' | 'renew' | 'rotate' | 'ca_key_rotation';
  serviceId: string;
  serialNumber: string;
  clientIdentity?: string;
  requestId?: string;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
}

export class AuditStore {
  private client: MongoClient;
  private collection: Collection<AuditEntry> | null = null;
  private mongoConnected = false;
  private readonly pendingEntries: AuditEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private readonly MAX_BUFFER = 5000;
  private readonly FLUSH_INTERVAL_MS = 5000;
  private readonly BATCH_SIZE = 200;

  constructor(private uri: string) {
    this.client = MongoManager.isInitialized() ? MongoManager.getClient() : new MongoClient(uri);
    this.startFlushTimer();
  }

  async connect(): Promise<void> {
    await this.tryConnect();
  }

  private async tryConnect(): Promise<boolean> {
    try {
      if (!MongoManager.isInitialized()) {
        await this.client.connect();
      }
      const db = MongoManager.isInitialized() ? MongoManager.getDb() : this.client.db();
      this.collection = db.collection<AuditEntry>('audit_log');
      await this.collection.createIndex({ timestamp: -1 }, { expireAfterSeconds: 90 * 86400 });
      await this.collection.createIndex({ serviceId: 1, timestamp: -1 });
      await this.collection.createIndex({ serialNumber: 1 });
      this.mongoConnected = true;
      return true;
    } catch (err) {
      logger.error('AuditStore: MongoDB connection failed — using local buffer', { err });
      this.mongoConnected = false;
      return false;
    }
  }

  private async ensureMongo(): Promise<boolean> {
    if (this.mongoConnected) return true;
    return this.tryConnect();
  }

  async disconnect(): Promise<void> {
    await this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (!MongoManager.isInitialized()) {
      try {
        await this.client.close();
      } catch {
        /* closing */
      }
    }
  }

  async log(entry: AuditEntry): Promise<void> {
    if (!(await this.ensureMongo()) || !this.collection) {
      this.buffer(entry);
      return;
    }
    try {
      await this.collection.insertOne(entry);
    } catch (err) {
      logger.error('AuditStore: MongoDB write failed — buffering entry', { err });
      this.mongoConnected = false;
      this.buffer(entry);
    }
  }

  private buffer(entry: AuditEntry): void {
    if (this.pendingEntries.length >= this.MAX_BUFFER) {
      const dropped = this.pendingEntries.shift()!;
      logger.warn('AuditStore: buffer full, dropping oldest entry', {
        action: dropped.action,
        serialNumber: dropped.serialNumber,
      });
    }
    this.pendingEntries.push(entry);
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => this.flush(), this.FLUSH_INTERVAL_MS);
    if (this.flushTimer && typeof this.flushTimer === 'object' && 'unref' in this.flushTimer) {
      this.flushTimer.unref();
    }
  }

  private async flush(): Promise<void> {
    if (this.pendingEntries.length === 0) return;
    if (!(await this.ensureMongo()) || !this.collection) return;

    const batch = this.pendingEntries.splice(0, this.BATCH_SIZE);
    try {
      await this.collection.insertMany(batch, { ordered: false });
    } catch (err) {
      // Re-buffer entries that failed to write
      this.pendingEntries.unshift(...batch);
      if (this.pendingEntries.length > this.MAX_BUFFER) {
        const dropped = this.pendingEntries.splice(this.MAX_BUFFER);
        logger.warn('AuditStore: flush failed, dropped entries', { count: dropped.length, err });
      } else {
        logger.error('AuditStore: flush failed, entries re-buffered', { count: batch.length, err });
      }
    }
  }
}
