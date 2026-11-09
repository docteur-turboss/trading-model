import { MongoConnectionManager as CommonMongoConnectionManager } from "@trading-model/persistence/mongo-connection-manager";
import type { Collection } from "mongodb";
import type { Env } from "../infrastructure/config/env";
import { IndexManager } from "./index-manager";
import { logger } from "./logger";

export class MongoConnectionManager extends CommonMongoConnectionManager {
	private _collection: Collection | null = null;
	private _collectionPromise: Promise<Collection> | null = null;
	private readonly _indexManager = new IndexManager();
	private _missingCriticalIndexes: string[] = [];
	private readonly _dlqCollectionName: string;

	constructor(env: Pick<Env, "MONGO_URI" | "MONGO_DB" | "MONGO_COLLECTION">) {
		super({
			uri: env.MONGO_URI,
			dbName: env.MONGO_DB,
			collectionName: env.MONGO_COLLECTION,
			minPoolSize: 2,
			poolSize: 10,
		});
		this._dlqCollectionName = env.MONGO_COLLECTION;
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
		const col = database.collection(this._dlqCollectionName);

		this._missingCriticalIndexes =
			await this._indexManager.createCollectionIndexes(col);

		this._collection = col;
		logger.info("MongoDB collection ready", {
			collection: this._dlqCollectionName,
		});
		return this._collection;
	}

	getMissingCriticalIndexes(): string[] {
		return this._missingCriticalIndexes;
	}

	protected _clearState(): void {
		super._clearState();
		this._collection = null;
		this._collectionPromise = null;
	}

	async resetState(): Promise<void> {
		await super.resetState();
		this._clearState();
	}

	async close(): Promise<void> {
		await super.close();
		this._clearState();
	}
}
