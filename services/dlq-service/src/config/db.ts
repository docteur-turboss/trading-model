import { MongoClient, Db, Collection } from 'mongodb';

import { normalizeError } from '@trading-model/common/utils/errors';

import { env } from './env';
import { logger } from './logger';

let client: MongoClient | null = null;
let db: Db | null = null;
let collection: Collection | null = null;
let dbPromise: Promise<Db> | null = null;
let collectionPromise: Promise<Collection> | null = null;
let connected = false;
let missingCriticalIndexes: string[] = [];

const MONGO_CONNECT_MAX_RETRIES = 10;
const MONGO_CONNECT_RETRY_BASE_MS = 1000;

const CRITICAL_INDEX_KEYS = [
  { retryCount: 1, createdAt: -1 },
  { createdAt: -1 },
  { messageId: 1 },
  { status: 1, retryCount: 1 },
];

export async function getDb(): Promise<Db> {
  if (db) return db;
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < MONGO_CONNECT_MAX_RETRIES; attempt++) {
      const newClient = new MongoClient(env.MONGO_URI, {
        minPoolSize: 2,
        maxPoolSize: 10,
        retryWrites: true,
        serverSelectionTimeoutMS: 5000,
        connectTimeoutMS: 5000,
      });

      try {
        await newClient.connect();
        client = newClient;
        db = newClient.db(env.MONGO_DB);
        connected = true;
        newClient.on('close', () => { connected = false; });
        newClient.on('reconnect', () => { connected = true; });
        logger.info('MongoDB connected', { database: env.MONGO_DB });
        return db;
      } catch (err) {
        lastError = err as Error;
        await newClient.close().catch(() => {});
        if (attempt < MONGO_CONNECT_MAX_RETRIES - 1) {
          const backoff = MONGO_CONNECT_RETRY_BASE_MS * Math.pow(2, attempt);
          logger.warn(`MongoDB connection attempt ${attempt + 1} failed, retrying in ${backoff}ms`, {
            error: (err as Error).message,
          });
          await new Promise(r => setTimeout(r, backoff));
        }
      }
    }
    connected = false;
    throw lastError ?? new Error('Failed to connect to MongoDB after retries');
  })();

  return dbPromise;
}

export async function getCollection(): Promise<Collection> {
  if (collection) return collection;
  if (collectionPromise) return collectionPromise;

  collectionPromise = (async () => {
    const database = await getDb();
    const col = database.collection(env.MONGO_COLLECTION);

    const indexSpecs = [
      { key: { topic: 1, createdAt: -1 } },
      { key: { createdAt: -1 } },
      { key: { createdAt: 1 }, options: { expireAfterSeconds: 30 * 86400 } },
      { key: { retryCount: 1, topic: 1, createdAt: -1 } },
      { key: { messageId: 1 }, options: { unique: true, sparse: true } },
      { key: { processingAt: 1 }, options: { sparse: true } },
      { key: { processingInstance: 1 } },
      { key: { status: 1, retryCount: 1 } },
      { key: { retryCount: 1, createdAt: -1 }, options: { partialFilterExpression: { processingAt: { $exists: false } } } },
      { key: { retryCount: 1, status: 1, createdAt: -1 }, options: { partialFilterExpression: { processingAt: { $exists: false } } } },
      { key: { contentHash: 1, status: 1 }, options: { sparse: true } },
    ];
    const criticalIndexSpecs = CRITICAL_INDEX_KEYS.map(key => ({ key }));
    const currentMissing: string[] = [];

    for (const spec of indexSpecs) {
      try {
        await col.createIndex(spec.key, spec.options);
      } catch (err) {
        const keyStr = JSON.stringify(spec.key);
        const isCritical = criticalIndexSpecs.some(c => JSON.stringify(c.key) === keyStr);
        if (isCritical) {
          currentMissing.push(keyStr);
          logger.error('Critical index creation failed — queries may perform collection scans', {
            index: spec.key,
            error: normalizeError(err).message,
          });
        } else {
          logger.warn('Index creation skipped', {
            index: spec.key,
            error: normalizeError(err).message,
          });
        }
      }
    }

    missingCriticalIndexes = currentMissing;
    collection = col;
    logger.info('MongoDB collection ready', { collection: env.MONGO_COLLECTION });

    return collection;
  })();

  return collectionPromise;
}

export function isDbConnected(): boolean {
  return connected && client !== null;
}

export function getMissingCriticalIndexes(): string[] {
  return missingCriticalIndexes;
}

export async function resetDbState(): Promise<void> {
  if (client) {
    try {
      await client.close();
    } catch {
      // ignore close error during reset
    }
  }
  client = null;
  db = null;
  collection = null;
  dbPromise = null;
  collectionPromise = null;
  connected = false;
  missingCriticalIndexes = [];
}

export async function closeDb(): Promise<void> {
  if (client) {
    try {
      await client.close();
    } catch (err) {
      logger.warn('Error closing MongoDB connection', { error: (err as Error).message });
    }
    client = null;
    db = null;
    collection = null;
    dbPromise = null;
    collectionPromise = null;
    connected = false;
    missingCriticalIndexes = [];
    logger.info('MongoDB connection closed');
  }
}
