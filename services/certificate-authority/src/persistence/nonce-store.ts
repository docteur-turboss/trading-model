/**
 * NonceStore — stores proof-of-possession (POP) nonces for certificate renewal.
 *
 * Flow:
 * 1. Client requests a renewal challenge → CA generates nonce, stores it
 * 2. Client signs the nonce with its private key → sends signature + old serial
 * 3. CA verifies signature against the old cert's public key → if valid, renews
 *
 * Nonces expire after ttlMs to prevent replay attacks.
 *
 * Persistence: Nonces are stored in both an in-memory Map (L1 cache) and
 * MongoDB (L2 persistence). On startup, all non-expired nonces are loaded
 * from MongoDB into memory. This ensures nonces survive CA restarts.
 */
import { randomBytes } from 'node:crypto';

import { MongoClient, Collection, Db } from 'mongodb';

import { logger } from '@trading-model/common/config/logger';

import { MongoManager } from './mongo-manager';

interface NonceEntry {
  nonce: string;
  serviceId: string;
  createdAt: number;
}

interface NonceDocument {
  nonce: string;
  serviceId: string;
  createdAt: Date;
}

export class NonceStore {
  private readonly l1 = new Map<string, NonceEntry>();
  private readonly ttlMs: number;
  private readonly mongoUri: string | null;
  private collection: Collection<NonceDocument> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ttlMs: number = 300_000, mongoUri?: string) {
    this.ttlMs = ttlMs;
    this.mongoUri = mongoUri ?? null;
    this.startCleanup();
  }

  async connect(): Promise<void> {
    if (!this.mongoUri) return;
    try {
      let db: Db;
      if (MongoManager.isInitialized()) {
        db = MongoManager.getDb();
      } else {
        const client = new MongoClient(this.mongoUri);
        await client.connect();
        db = client.db();
      }
      this.collection = db.collection<NonceDocument>('nonces');
      await this.collection.createIndex({ nonce: 1 }, { unique: true });
      await this.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: Math.ceil(this.ttlMs / 1000) });
      await this.loadFromMongo();
      logger.info('NonceStore connected to MongoDB', { existingNonces: this.l1.size });
    } catch (err) {
      logger.warn('NonceStore MongoDB connection failed, operating in memory-only mode', { err });
      this.collection = null;
    }
  }

  async disconnect(): Promise<void> {
    this.destroy();
    this.collection = null;
  }

  /**
   * Generates a cryptographically random nonce for a given service.
   * @returns The nonce string that the client must sign.
   */
  async generate(serviceId: string): Promise<string> {
    const nonce = randomBytes(32).toString('hex');
    const entry: NonceEntry = { nonce, serviceId, createdAt: Date.now() };
    if (this.collection) {
      try {
        await this.collection.insertOne({
          nonce,
          serviceId,
          createdAt: new Date(entry.createdAt),
        });
      } catch (err) {
        logger.warn('Failed to persist nonce to MongoDB', { err });
        throw new Error('Failed to persist nonce', { cause: err });
      }
    }
    this.l1.set(nonce, entry);
    return nonce;
  }

  /**
   * Verifies a nonce is valid and was issued for the given service.
   * Consumes the nonce (single-use) to prevent replay attacks.
   */
  async consume(nonce: string, serviceId: string): Promise<boolean> {
    // Fast path: reject expired nonces from L1 cache without MongoDB round-trip
    const entry = this.l1.get(nonce);
    if (entry) {
      if (Date.now() - entry.createdAt > this.ttlMs) {
        this.l1.delete(nonce);
        return false;
      }
    }

    // Authoritative check: atomic MongoDB findOneAndDelete (cross-instance safe)
    if (this.collection) {
      try {
        const doc = await this.collection.findOneAndDelete({ nonce });
        if (!doc) return false;
        if (doc.serviceId !== serviceId) return false;
        if (Date.now() - doc.createdAt.getTime() > this.ttlMs) return false;
        this.l1.delete(nonce);
        return true;
      } catch {
        return false;
      }
    }

    // Memory-only mode (dev/test): use L1 cache as source of truth
    if (entry) {
      if (entry.serviceId !== serviceId) return false;
      this.l1.delete(nonce);
      return true;
    }
    return false;
  }

  get size(): number {
    return this.l1.size;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.l1.clear();
    this.collection = null;
  }

  private async loadFromMongo(): Promise<void> {
    if (!this.collection) return;
    try {
      const threshold = new Date(Date.now() - this.ttlMs);
      const docs = await this.collection.find({ createdAt: { $gt: threshold } }).toArray();
      for (const doc of docs) {
        this.l1.set(doc.nonce, {
          nonce: doc.nonce,
          serviceId: doc.serviceId,
          createdAt: doc.createdAt.getTime(),
        });
      }
    } catch (err) {
      logger.warn('Failed to load nonces from MongoDB', { err });
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [nonce, entry] of this.l1) {
        if (now - entry.createdAt > this.ttlMs) {
          this.l1.delete(nonce);
        }
      }
    }, Math.min(this.ttlMs / 2, 60_000));
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }
}
