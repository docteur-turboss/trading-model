/**
 * MONGO_MANAGER — singleton MongoDB connection pool for the CA service.
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

import { logger } from "@trading-model/common/config/logger";
import { type Db, MongoClient } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;
let uri = "";
let poolSize = 50;
let initialized = false;

/**
 * Initializes the shared MongoDB connection pool.
 * Call once at service startup (from CA bootstrap).
 */
async function initialize(
	uriParam: string,
	poolSizeParam?: number
): Promise<void> {
	if (initialized) {
		return;
	}
	uri = uriParam;
	poolSize =
		poolSizeParam ?? Number.parseInt(process.env.MONGO_POOL_SIZE ?? "50", 10);

	client = new MongoClient(uri, {
		maxPoolSize: poolSize,
		minPoolSize: Math.max(2, Math.floor(poolSize / 5)),
		serverSelectionTimeoutMS: 5000,
		connectTimeoutMS: 5000,
		retryWrites: true,
		retryReads: true,
	});

	await client.connect();
	db = client.db();
	initialized = true;

	logger.info("MONGO_MANAGER initialized", {
		context: {
			poolSize,
			database: db.databaseName,
		},
	});
}

/** Returns the shared MongoClient instance. */
function getClient(): MongoClient {
	if (!client) {
		throw new Error(
			"MONGO_MANAGER not initialized. Call MONGO_MANAGER.initialize() first."
		);
	}
	return client;
}

/** Returns the shared Db instance. */
function getDb(): Db {
	if (!db) {
		throw new Error(
			"MONGO_MANAGER not initialized. Call MONGO_MANAGER.initialize() first."
		);
	}
	return db;
}

/** Returns the configured pool size. */
function getPoolSize(): number {
	return poolSize;
}

/** Returns true if the manager has been initialized. */
function isInitialized(): boolean {
	return initialized;
}

/**
 * Attempts to reconnect if the MongoDB connection was lost.
 * Called by persistence stores when an operation fails.
 */
async function tryReconnect(): Promise<boolean> {
	if (client) {
		try {
			await client.close();
		} catch {
			// ignore close errors
		}
		client = null;
		db = null;
		initialized = false;
	}
	try {
		await initialize(uri, poolSize);
		return true;
	} catch {
		logger.warn("MONGO_MANAGER reconnection failed");
		return false;
	}
}

/** Closes the shared connection pool. Call once at service shutdown. */
async function close(): Promise<void> {
	if (client) {
		try {
			await client.close();
		} catch (err) {
			logger.warn("MONGO_MANAGER close error", { context: { err } });
		}
		client = null;
		db = null;
		initialized = false;
		logger.info("MONGO_MANAGER connection pool closed");
	}
}

export const MONGO_MANAGER = {
	initialize,
	getClient,
	getDb,
	getPoolSize,
	isInitialized,
	tryReconnect,
	close,
};
