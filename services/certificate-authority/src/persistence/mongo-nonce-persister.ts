import { logger } from "@trading-model/common/config/logger";
import { MongoClient, type Db } from "mongodb";

import { MONGO_MANAGER } from "./mongo-manager";
import type {
	NonceContext,
	NonceDocument,
	NoncePersistence,
} from "./nonce-persistence.interface";

interface INonceCollection {
	insertOne(doc: NonceDocument): Promise<{ acknowledged: boolean }>;
	findOneAndDelete(
		filter: Record<string, unknown>
	): Promise<NonceDocument | null>;
	find(filter: Record<string, unknown>): {
		toArray(): Promise<NonceDocument[]>;
	};
	createIndex(
		keys: Record<string, unknown>,
		options?: Record<string, unknown>
	): Promise<string>;
}

class NullNonceCollection implements INonceCollection {
	insertOne(): Promise<{ acknowledged: boolean }> {
		return Promise.resolve({ acknowledged: false });
	}
	findOneAndDelete(): Promise<NonceDocument | null> {
		return Promise.resolve(null);
	}
	find(): { toArray(): Promise<NonceDocument[]> } {
		return { toArray: async () => [] };
	}
	createIndex(): Promise<string> {
		return Promise.resolve("");
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

	private _buildNonceDocument(
		nonce: string,
		serviceId: string,
		createdAt: number
	): NonceDocument {
		return { nonce, serviceId, createdAt: new Date(createdAt) };
	}

	private _rethrowWithCause(err: unknown): never {
		logger.warn("Failed to persist nonce to MongoDB", { context: { err } });
		const error = new Error("Failed to persist nonce");
		(error as { cause?: unknown }).cause = err;
		throw error;
	}

	async persist(context: NonceContext, createdAt: number): Promise<void> {
		const { nonce, serviceId } = context;
		try {
			await this._collection.insertOne(
				this._buildNonceDocument(nonce, serviceId, createdAt)
			);
		} catch (err) {
			this._rethrowWithCause(err);
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
