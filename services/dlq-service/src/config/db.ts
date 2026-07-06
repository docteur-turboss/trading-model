import { retryWithBackoff } from "@trading-model/common/utils/retry";
import { normalizeError } from "@trading-model/common/utils/errors";
import { type Collection, type Db, MongoClient } from "mongodb";

import { env } from "./env";
import { logger } from "./logger";

let client: MongoClient | null = null;
let db: Db | null = null;
let collection: Collection | null = null;
let dbPromise: Promise<Db> | null = null;
let collectionPromise: Promise<Collection> | null = null;
let connected = false;
let missingCriticalIndexes: string[] = [];

const CRITICAL_INDEX_KEYS = [
	{ retryCount: 1, createdAt: -1 },
	{ createdAt: -1 },
	{ messageId: 1 },
	{ status: 1, retryCount: 1 },
];

export async function getDb(): Promise<Db> {
	if (db) {
		return db;
	}
	const existingDb = dbPromise === null ? null : await dbPromise;
	if (existingDb) {
		return existingDb;
	}

	dbPromise = _connectToMongo();
	return dbPromise;
}

function _registerMongoEvents(newClient: MongoClient): void {
	newClient.on("close", () => {
		connected = false;
	});
	newClient.on("reconnect", () => {
		connected = true;
	});
}

async function _connectToMongo(): Promise<Db> {
	const { result: dbInstance, lastError } = await retryWithBackoff(async () => {
		return _tryConnect();
	}, {
		maxRetries: 10,
		baseDelayMs: 1000,
		maxDelayMs: 30000,
	});

	if (!dbInstance) {
		return _throwConnectError(lastError);
	}

	client = dbInstance.newClient;
	db = dbInstance.database;
	connected = true;
	logger.info("MongoDB connected", { database: env.MONGO_DB });
	return dbInstance.database;
}

function _throwConnectError(
	lastError: Error | undefined
): never {
	connected = false;
	throw lastError ?? new Error("Failed to connect to MongoDB after retries");
}

async function _tryConnect(): Promise<{
	newClient: MongoClient;
	database: Db;
}> {
	const newClient = new MongoClient(env.MONGO_URI, {
		minPoolSize: 2,
		maxPoolSize: 10,
		retryWrites: true,
		serverSelectionTimeoutMS: 5000,
		connectTimeoutMS: 5000,
	});
	await newClient.connect();
	const database = newClient.db(env.MONGO_DB);
	_registerMongoEvents(newClient);
	return { newClient, database };
}

async function _createIndex(
	col: Collection,
	spec: {
		key: Record<string, 1 | -1>;
		options?: Record<string, unknown>;
	},
	criticalKeys: Set<string>
): Promise<string | null> {
	const keyStr = JSON.stringify(spec.key);
	try {
		await col.createIndex(spec.key, spec.options);
		return null;
	} catch (err) {
		if (criticalKeys.has(keyStr)) {
			logger.error(
				"Critical index creation failed — queries may perform collection scans",
				{
					index: spec.key,
					error: normalizeError(err).message,
				}
			);
			return keyStr;
		}
		logger.warn("Index creation skipped", {
			index: spec.key,
			error: normalizeError(err).message,
		});
		return null;
	}
}

function _buildIndexSpecs(): {
	key: Record<string, 1 | -1>;
	options?: Record<string, unknown>;
}[] {
	return [
		{ key: { topic: 1, createdAt: -1 } },
		{ key: { createdAt: -1 } },
		{ key: { createdAt: 1 }, options: { expireAfterSeconds: 30 * 86400 } },
		{ key: { retryCount: 1, topic: 1, createdAt: -1 } },
		{ key: { messageId: 1 }, options: { unique: true, sparse: true } },
		{ key: { processingAt: 1 }, options: { sparse: true } },
		{ key: { processingInstance: 1 } },
		{ key: { status: 1, retryCount: 1 } },
		{
			key: { retryCount: 1, createdAt: -1 },
			options: {
				partialFilterExpression: { processingAt: { $exists: false } },
			},
		},
		{
			key: { retryCount: 1, status: 1, createdAt: -1 },
			options: {
				partialFilterExpression: { processingAt: { $exists: false } },
			},
		},
		{ key: { contentHash: 1, status: 1 }, options: { sparse: true } },
	];
}

async function createCollectionIndexes(col: Collection): Promise<void> {
	const indexSpecs = _buildIndexSpecs();
	const criticalKeys = new Set(
		CRITICAL_INDEX_KEYS.map((key) => JSON.stringify({ key }))
	);
	const missing = await Promise.all(
		indexSpecs.map((spec) => _createIndex(col, spec, criticalKeys))
	);
	missingCriticalIndexes = missing.filter(Boolean) as string[];
}

export async function getCollection(): Promise<Collection> {
	if (collection) {
		return collection;
	}

	const existingCollection =
		collectionPromise === null ? null : await collectionPromise;
	if (existingCollection) {
		return existingCollection;
	}

	collectionPromise = _initCollection();
	return collectionPromise;
}

async function _initCollection(): Promise<Collection> {
	const database = await getDb();
	const col = database.collection(env.MONGO_COLLECTION);

	await createCollectionIndexes(col);

	collection = col;
	logger.info("MongoDB collection ready", {
		collection: env.MONGO_COLLECTION,
	});
	return collection;
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
	_clearDbState();
}

export async function closeDb(): Promise<void> {
	if (client) {
		try {
			await client.close();
		} catch (err) {
			logger.warn("Error closing MongoDB connection", {
				error: (err as Error).message,
			});
		}
		_clearDbState();
		logger.info("MongoDB connection closed");
	}
}

function _clearDbState(): void {
	client = null;
	db = null;
	collection = null;
	dbPromise = null;
	collectionPromise = null;
	connected = false;
	missingCriticalIndexes = [];
}
