import { ConnectionManager } from "@trading-model/common/persistence/connection-manager";
import { type Collection, type Db, MongoClient } from "mongodb";

import { ENV } from "./env";
import { IndexManager } from "./index-manager";
import { logger } from "./logger";

export class MongoConnectionManager extends ConnectionManager<MongoClient> {
	private _collection: Collection | null = null;
	private _collectionPromise: Promise<Collection> | null = null;
	private readonly _indexManager = new IndexManager();

	constructor() {
		super(
			async () => {
				const newClient = new MongoClient(ENV.MONGO_URI, {
					minPoolSize: 2,
					maxPoolSize: 10,
					retryWrites: true,
					serverSelectionTimeoutMS: 5000,
					connectTimeoutMS: 5000,
				});
				await newClient.connect();
				newClient.on("close", () => {
					this._connected = false;
				});
				newClient.on("reconnect", () => {
					this._connected = true;
				});
				logger.info("MongoDB connected", { database: ENV.MONGO_DB });
				return newClient;
			},
			async (client: MongoClient) => {
				await client.close();
			},
			{
				maxRetries: 10,
				baseDelayMs: 1000,
				maxDelayMs: 30000,
			}
		);
	}

	async getDb(): Promise<Db> {
		const client = await this.getConnection();
		return client.db(ENV.MONGO_DB);
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
		const col = database.collection(ENV.MONGO_COLLECTION);

		await this._indexManager.createCollectionIndexes(col);

		this._collection = col;
		logger.info("MongoDB collection ready", {
			collection: ENV.MONGO_COLLECTION,
		});
		return this._collection;
	}

	getMissingCriticalIndexes(): string[] {
		return this._indexManager.getMissingCriticalIndexes();
	}

	private _clearState(): void {
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
