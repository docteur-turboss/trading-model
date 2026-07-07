import { logger } from "@trading-model/common/config/logger";
import { type Collection, type Db, MongoClient } from "mongodb";

import { MONGO_MANAGER } from "./mongo-manager";

export interface NonceContext {
	nonce: string;
	serviceId: string;
}

export interface NonceDocument {
	nonce: string;
	serviceId: string;
	createdAt: Date;
}

export interface NoncePersistence {
	connect(): Promise<void>;
	disconnect(): Promise<void>;
	persist(context: NonceContext, createdAt: number): Promise<void>;
	consume(context: NonceContext): Promise<NonceDocument | null>;
	loadAll(threshold: Date): Promise<NonceDocument[]>;
}

interface INonceCollection {
	insertOne(doc: NonceDocument): Promise<{ acknowledged: boolean }>;
	findOneAndDelete(filter: Record<string, unknown>): Promise<NonceDocument | null>;
	find(filter: Record<string, unknown>): {
		toArray(): Promise<NonceDocument[]>;
	};
	createIndex(
		keys: Record<string, unknown>,
		options?: Record<string, unknown>
	): Promise<string>;
}

class NullNonceCollection implements INonceCollection {
	async insertOne(): Promise<{ acknowledged: boolean }> {
		throw new Error("Nonce persister not connected");
	}
	async findOneAndDelete(): Promise<NonceDocument | null> {
		return null;
	}
	find(): { toArray(): Promise<NonceDocument[]> } {
		return { toArray: async () => [] };
	}
	async createIndex(): Promise<string> {
		return "";
	}
}

export class MongoNoncePersister implements NoncePersistence {
	private _collection: INonceCollection = new NullNonceCollection();
	private readonly _mongoUri: string;
	private readonly _ttlMs: number;

	constructor(mongoUri: string, ttlMs: number) {
		this._mongoUri = mongoUri;
		this._ttlMs = ttlMs;
	}

	private async _resolveDb(): Promise<Db> {
		if (MONGO_MANAGER.isInitialized()) {
			return MONGO_MANAGER.getDb();
		}
		const client = new MongoClient(this._mongoUri);
		await client.connect();
		return client.db();
	}

	private async _createIndexes(): Promise<void> {
		await this._collection.createIndex({ nonce: 1 }, { unique: true });
		await this._collection.createIndex(
			{ createdAt: 1 },
			{ expireAfterSeconds: Math.ceil(this._ttlMs / 1000) }
		);
	}

	async connect(): Promise<void> {
		const db = await this._resolveDb();
		this._collection = db.collection<NonceDocument>("nonces");
		await this._createIndexes();
	}

	async disconnect(): Promise<void> {}

	async persist(context: NonceContext, createdAt: number): Promise<void> {
		const { nonce, serviceId } = context;
		try {
			await this._collection.insertOne({
				nonce,
				serviceId,
				createdAt: new Date(createdAt),
			});
		} catch (err) {
			logger.warn("Failed to persist nonce to MongoDB", { context: { err } });
			const error = new Error("Failed to persist nonce");
			(error as { cause?: unknown }).cause = err;
			throw error;
		}
	}

	async consume(context: NonceContext): Promise<NonceDocument | null> {
		const { nonce } = context;
		try {
			return await this._collection.findOneAndDelete({ nonce });
		} catch {
			return null;
		}
	}

	async loadAll(threshold: Date): Promise<NonceDocument[]> {
		try {
			return await this._collection
				.find({ createdAt: { $gt: threshold } })
				.toArray();
		} catch (err) {
			logger.warn("Failed to load nonces from MongoDB", { context: { err } });
			return [];
		}
	}
}

export class NullNoncePersister implements NoncePersistence {
	async connect(): Promise<void> {}
	async disconnect(): Promise<void> {}
	async persist(_context: NonceContext, _createdAt: number): Promise<void> {}
	async consume(_context: NonceContext): Promise<NonceDocument | null> {
		return null;
	}
	async loadAll(_threshold: Date): Promise<NonceDocument[]> {
		return [];
	}
}
