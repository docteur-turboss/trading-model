import type { Collection, Db } from "mongodb";

import { env } from "./env";
import { IndexManager } from "./index-manager";
import { logger } from "./logger";
import { MongoConnectionManager } from "./mongo-connection-manager";

class MongoManager {
	private _collection: Collection | null = null;
	private _collectionPromise: Promise<Collection> | null = null;
	private readonly _connectionManager = new MongoConnectionManager();
	private readonly _indexManager = new IndexManager();

	async getDb(): Promise<Db> {
		return this._connectionManager.getDb();
	}

	async getCollection(): Promise<Collection> {
		if (this._collection) {
			return this._collection;
		}

		const existingCollection =
			this._collectionPromise === null ? null : await this._collectionPromise;
		if (existingCollection) {
			return existingCollection;
		}

		this._collectionPromise = this._initCollection();
		return this._collectionPromise;
	}

	private async _initCollection(): Promise<Collection> {
		const database = await this.getDb();
		const col = database.collection(env.MONGO_COLLECTION);

		await this._indexManager.createCollectionIndexes(col);

		this._collection = col;
		logger.info("MongoDB collection ready", {
			collection: env.MONGO_COLLECTION,
		});
		return this._collection;
	}

	isConnected(): boolean {
		return this._connectionManager.isConnected();
	}

	getMissingCriticalIndexes(): string[] {
		return this._indexManager.getMissingCriticalIndexes();
	}

	async resetState(): Promise<void> {
		await this._connectionManager.resetState();
		this._clearState();
	}

	async close(): Promise<void> {
		await this._connectionManager.close();
		this._clearState();
	}

	private _clearState(): void {
		this._collection = null;
		this._collectionPromise = null;
	}
}

const mongoManager = new MongoManager();

export async function getDb(): Promise<Db> {
	return mongoManager.getDb();
}

export async function getCollection(): Promise<Collection> {
	return mongoManager.getCollection();
}

export function isDbConnected(): boolean {
	return mongoManager.isConnected();
}

export function getMissingCriticalIndexes(): string[] {
	return mongoManager.getMissingCriticalIndexes();
}

export async function resetDbState(): Promise<void> {
	return mongoManager.resetState();
}

export async function closeDb(): Promise<void> {
	return mongoManager.close();
}
