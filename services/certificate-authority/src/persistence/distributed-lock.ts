import { randomUUID, randomInt } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import Redis from 'ioredis';
import { MongoClient, Collection } from 'mongodb';

import { logger } from '@trading-model/common/config/logger';

import { MongoManager } from './mongo-manager';

interface LockDocument {
  name: string;
  acquiredAt: Date;
  expiresAt: Date;
  instanceId: string;
  fencingToken: number;
}

export interface DistributedLockOptions {
  uri: string;
  lockName: string;
  ttlMs: number;
  redisUrl?: string;
  fallbackDir?: string;
}

export class DistributedLock {
  private client: MongoClient;
  private collection: Collection<LockDocument> | null = null;
  private readonly lockName: string;
  private readonly ttlMs: number;
  private readonly instanceId: string;
  private mongoConnected = false;
  private redisAvailable = false;
  private redisClient: Redis | null = null;
  private readonly redisUrl: string | null;
  private readonly fallbackDir: string;
  private currentFencingToken: number = -1;

  constructor(options: DistributedLockOptions) {
    this.client = new MongoClient(options.uri);
    this.lockName = options.lockName;
    this.ttlMs = options.ttlMs;
    this.instanceId = randomUUID().substring(0, 8);
    this.redisUrl = options.redisUrl ?? null;
    this.fallbackDir =
      options.fallbackDir ?? path.join(process.cwd(), 'data', 'ca-fallback', 'locks');
  }

  async connect(): Promise<void> {
    try {
      if (MongoManager.isInitialized()) {
        this.client = MongoManager.getClient();
        const db = MongoManager.getDb();
        this.collection = db.collection<LockDocument>('locks');
        this.mongoConnected = true;
      } else {
        await this.client.connect();
        const db = this.client.db();
        this.collection = db.collection<LockDocument>('locks');
        this.mongoConnected = true;
      }
      await this.collection!.createIndex({ name: 1 }, { unique: true });
      await this.collection!.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    } catch (err) {
      logger.warn('MongoDB lock connection failed', { err });
    }
  }

  private connectRedis(redisUrl: string): void {
    try {
      this.redisClient = new Redis(redisUrl, {
        enableReadyCheck: true,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true,
      });
      this.redisClient.on('error', () => {
        this.redisAvailable = false;
      });
    } catch {
      this.redisClient = null;
    }
  }

  async disconnect(): Promise<void> {
    if (!MongoManager.isInitialized()) {
      try {
        await this.client.close();
      } catch {
        /* closing */
      }
    }
    this.redisClient?.disconnect();
  }

  /**
   * Returns the fencing token if the lock is still held by this instance,
   * or -1 if the lock was lost (stolen by another instance).
   */
  async verifyOwnership(): Promise<number> {
    if (this.currentFencingToken < 0) return -1;

    if (this.mongoConnected && this.collection) {
      try {
        const doc = await this.collection.findOne({ name: this.lockName });
        if (
          !doc ||
          doc.instanceId !== this.instanceId ||
          doc.fencingToken !== this.currentFencingToken
        ) {
          this.currentFencingToken = -1;
          return -1;
        }
        return this.currentFencingToken;
      } catch {
        this.mongoConnected = false;
      }
    }

    if (this.redisClient && this.redisAvailable) {
      try {
        const lockKey = `lock:${this.lockName}`;
        const val = await this.redisClient.get(lockKey);
        if (val !== `${this.instanceId}:${this.currentFencingToken}`) {
          this.currentFencingToken = -1;
          return -1;
        }
        return this.currentFencingToken;
      } catch {
        // ignore
      }
    }

    this.currentFencingToken = -1;
    return -1;
  }

  async acquire(redisUrl?: string): Promise<boolean> {
    const effectiveRedisUrl: string | undefined = redisUrl ?? this.redisUrl ?? undefined;

    // 1. Try MongoDB
    if (this.mongoConnected && this.collection) {
      try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + this.ttlMs);
        const prev = await this.collection.findOne({ name: this.lockName });
        const nextFencingToken = (prev?.fencingToken ?? 0) + 1;
        const result = await this.collection.findOneAndUpdate(
          {
            name: this.lockName,
            $or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }],
          },
          {
            $set: {
              name: this.lockName,
              acquiredAt: now,
              expiresAt,
              instanceId: this.instanceId,
              fencingToken: nextFencingToken,
            },
          },
          { upsert: true, returnDocument: 'before' }
        );
        const acquired = result === null || (result.expiresAt && result.expiresAt < now);
        if (acquired) {
          this.currentFencingToken = nextFencingToken;
        }
        return acquired;
      } catch (err) {
        logger.warn('MongoDB lock acquire failed, falling back to Redis', { err });
        this.mongoConnected = false;
      }
    }

    // 2. Try Redis (distributed, shared across instances)
    if (effectiveRedisUrl && !this.redisClient) {
      this.connectRedis(effectiveRedisUrl);
    }
    if (this.redisClient) {
      try {
        const lockKey = `lock:${this.lockName}`;
        const nextFencingToken = randomInt(1, 2_147_483_647);
        const value = `${this.instanceId}:${nextFencingToken}`;
        const acquired = await this.redisClient.set(lockKey, value, 'PX', this.ttlMs, 'NX');
        if (acquired === 'OK') {
          this.redisAvailable = true;
          this.currentFencingToken = nextFencingToken;
          return true;
        }
        const existing = await this.redisClient.get(lockKey);
        if (existing === null) {
          return this.acquire(effectiveRedisUrl);
        }
        return false;
      } catch (err) {
        logger.warn('Redis lock acquire failed, using local fallback', { err });
        this.redisClient = null;
      }
    }

    // 3. Local fallback: file-based lock with TTL (single instance only — dev only)
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      try {
        await fs.mkdir(this.fallbackDir, { recursive: true });
        const lockFile = path.join(this.fallbackDir, `${this.lockName}.lock`);
        try {
          const existing = await fs.readFile(lockFile, 'utf8');
          const data = JSON.parse(existing);
          if (Date.now() - data.acquiredAt < this.ttlMs) {
            return false;
          }
        } catch {
          // file doesn't exist or is invalid — lock is free
        }
        const fencingToken = Date.now();
        await fs.writeFile(
          lockFile,
          JSON.stringify({
            instanceId: this.instanceId,
            acquiredAt: Date.now(),
            ttlMs: this.ttlMs,
            fencingToken,
          }),
          { mode: 0o600 }
        );
        this.currentFencingToken = fencingToken;
        return true;
      } catch {
        logger.error('All lock backends failed — unable to acquire lock');
        return false;
      }
    }
    logger.error(
      'No lock backend available (MongoDB, Redis) and filesystem fallback is disabled in production'
    );
    return false;
  }

  async release(): Promise<void> {
    const savedToken = this.currentFencingToken;
    this.currentFencingToken = -1;

    if (this.mongoConnected && this.collection) {
      try {
        await this.collection.deleteOne({
          name: this.lockName,
          instanceId: this.instanceId,
          fencingToken: savedToken,
        });
        return;
      } catch {
        this.mongoConnected = false;
      }
    }
    if (this.redisClient && this.redisAvailable) {
      try {
        const lockKey = `lock:${this.lockName}`;
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await this.redisClient.eval(script, 1, lockKey, `${this.instanceId}:${savedToken}`);
        return;
      } catch {
        // ignore
      }
    }
    try {
      const lockFile = path.join(this.fallbackDir, `${this.lockName}.lock`);
      await fs.unlink(lockFile);
    } catch {
      // ignore
    }
  }
}
