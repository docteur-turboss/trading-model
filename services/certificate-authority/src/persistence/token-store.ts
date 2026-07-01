import { createHash } from 'node:crypto';

import { MongoClient, Collection, Db } from 'mongodb';

import { MongoManager } from './mongo-manager';

export interface UsedToken {
  tokenHash: string;
  serviceId: string;
  usedAt: Date;
  expiresAt: Date;
}

export class TokenStore {
  private client: MongoClient | null = null;
  private collection: Collection<UsedToken> | null = null;
  private readonly uri: string;
  private readonly dbName: string;
  private readonly defaultTtlMs: number;

  constructor(uri: string, dbName?: string, defaultTtlMs?: number) {
    this.uri = uri;
    this.dbName = dbName ?? 'certificate-authority';
    this.defaultTtlMs = defaultTtlMs ?? 604_800_000; // 7 days default TTL
  }

  async connect(): Promise<void> {
    if (MongoManager.isInitialized()) {
      const db: Db = MongoManager.getDb();
      this.collection = db.collection<UsedToken>('used_tokens');
      await this.createIndexes();
      return;
    }
    this.client = new MongoClient(this.uri);
    await this.client.connect();
    const db: Db = this.client.db(this.dbName);
    this.collection = db.collection<UsedToken>('used_tokens');

    await this.createIndexes();
  }

  async disconnect(): Promise<void> {
    if (!MongoManager.isInitialized()) {
      await this.client?.close();
    }
    this.client = null;
    this.collection = null;
  }

  private async createIndexes(): Promise<void> {
    if (!this.collection) return;
    await this.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.collection.createIndex({ tokenHash: 1 }, { unique: true });
  }

  async tryUseToken(token: string, serviceId: string, ttlMs?: number): Promise<boolean> {
    if (!this.collection) throw new Error('TokenStore not connected');

    const ttl = ttlMs ?? this.defaultTtlMs;
    const hash = await this.hashToken(token);

    try {
      await this.collection.insertOne({
        tokenHash: hash,
        serviceId,
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + ttl),
      });
      return true;
    } catch (err: unknown) {
      if ((err as Record<string, unknown>)?.code === 11000) {
        return false;
      }
      throw err;
    }
  }

  async markAsUsed(token: string, serviceId: string, ttlMs?: number): Promise<void> {
    const ok = await this.tryUseToken(token, serviceId, ttlMs);
    if (!ok) throw new Error('Bootstrap token has already been used');
  }

  async isUsed(token: string): Promise<boolean> {
    if (!this.collection) throw new Error('TokenStore not connected');

    const hash = await this.hashToken(token);
    const found = await this.collection.findOne({ tokenHash: hash });
    return found !== null;
  }

  private async hashToken(token: string): Promise<string> {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
