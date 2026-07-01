/**
 * MongoManager — singleton MongoDB connection pool for the CA service.
 *
 * All persistence stores (CertificateStore, CrlStore, CaStore, TokenStore, etc.)
 * share a single MongoClient instance through this manager, avoiding connection
 * proliferation and allowing centralised pool configuration.
 *
 * Pool sizing:
 * - maxPoolSize: 50 (default) — sufficient for batch cert operations + concurrent queries
 * - minPoolSize: 10 — keep warm connections ready for burst traffic
 * - serverSelectionTimeoutMS: 5000 — fail fast if MongoDB is unreachable
 * - connectTimeoutMS: 5000 — fast connection timeout
 *
 * In production, tune MONGO_POOL_SIZE env var based on expected concurrency.
 * Formula: (max concurrent rotations × batch size) + query overhead
 * Example: 10 concurrent × 10 batch + 10 overhead = 110
 */
import { MongoClient, Db } from 'mongodb';

import { logger } from '@trading-model/common/config/logger';

export class MongoManager {
  private static client: MongoClient | null = null;
  private static db: Db | null = null;
  private static uri: string = '';
  private static poolSize: number = 50;
  private static initialized = false;

  /**
   * Initializes the shared MongoDB connection pool.
   * Call once at service startup (from CA bootstrap).
   */
  static async initialize(uri: string, poolSize?: number): Promise<void> {
    if (this.initialized) return;
    this.uri = uri;
    this.poolSize = poolSize ?? parseInt(process.env.MONGO_POOL_SIZE ?? '50', 10);

    this.client = new MongoClient(uri, {
      maxPoolSize: this.poolSize,
      minPoolSize: Math.max(2, Math.floor(this.poolSize / 5)),
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      retryWrites: true,
      retryReads: true,
    });

    await this.client.connect();
    this.db = this.client.db();
    this.initialized = true;

    logger.info('MongoManager initialized', {
      poolSize: this.poolSize,
      database: this.db.databaseName,
    });
  }

  /** Returns the shared MongoClient instance. */
  static getClient(): MongoClient {
    if (!this.client) {
      throw new Error('MongoManager not initialized. Call MongoManager.initialize() first.');
    }
    return this.client;
  }

  /** Returns the shared Db instance. */
  static getDb(): Db {
    if (!this.db) {
      throw new Error('MongoManager not initialized. Call MongoManager.initialize() first.');
    }
    return this.db;
  }

  /** Returns the configured pool size. */
  static getPoolSize(): number {
    return this.poolSize;
  }

  /** Returns true if the manager has been initialized. */
  static isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Attempts to reconnect if the MongoDB connection was lost.
   * Called by persistence stores when an operation fails.
   */
  static async tryReconnect(): Promise<boolean> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        // ignore close errors
      }
      this.client = null;
      this.db = null;
      this.initialized = false;
    }
    try {
      await this.initialize(this.uri, this.poolSize);
      return true;
    } catch {
      logger.warn('MongoManager reconnection failed');
      return false;
    }
  }

  /** Closes the shared connection pool. Call once at service shutdown. */
  static async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (err) {
        logger.warn('MongoManager close error', { err });
      }
      this.client = null;
      this.db = null;
      this.initialized = false;
      logger.info('MongoManager connection pool closed');
    }
  }
}
