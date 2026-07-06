import { retryWithBackoff } from "@trading-model/common/utils/retry";
import { type Db, MongoClient } from "mongodb";

import { env } from "./env";
import { logger } from "./logger";

export class MongoConnectionManager {
	private _client: MongoClient | null = null;
	private _db: Db | null = null;
	private _dbPromise: Promise<Db> | null = null;
	private _connected = false;

	async getDb(): Promise<Db> {
		if (this._db) {
			return this._db;
		}
		const existingDb = this._dbPromise === null ? null : await this._dbPromise;
		if (existingDb) {
			return existingDb;
		}

		this._dbPromise = this._connectToMongo();
		return this._dbPromise;
	}

	private _registerMongoEvents(newClient: MongoClient): void {
		newClient.on("close", () => {
			this._connected = false;
		});
		newClient.on("reconnect", () => {
			this._connected = true;
		});
	}

	private async _connectToMongo(): Promise<Db> {
		const { result: dbInstance, lastError } = await retryWithBackoff(
			async () => {
				return this._tryConnect();
			},
			{
				maxRetries: 10,
				baseDelayMs: 1000,
				maxDelayMs: 30000,
			}
		);

		if (!dbInstance) {
			return this._throwConnectError(lastError);
		}

		this._client = dbInstance.newClient;
		this._db = dbInstance.database;
		this._connected = true;
		logger.info("MongoDB connected", { database: env.MONGO_DB });
		return dbInstance.database;
	}

	private _throwConnectError(lastError: Error | undefined): never {
		this._connected = false;
		throw lastError ?? new Error("Failed to connect to MongoDB after retries");
	}

	private async _tryConnect(): Promise<{
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
		this._registerMongoEvents(newClient);
		return { newClient, database };
	}

	isConnected(): boolean {
		return this._connected && this._client !== null;
	}

	async resetState(): Promise<void> {
		if (this._client) {
			try {
				await this._client.close();
			} catch {
			}
		}
		this._clearState();
	}

	async close(): Promise<void> {
		if (this._client) {
			try {
				await this._client.close();
			} catch (err) {
				logger.warn("Error closing MongoDB connection", {
					error: (err as Error).message,
				});
			}
			this._clearState();
			logger.info("MongoDB connection closed");
		}
	}

	private _clearState(): void {
		this._client = null;
		this._db = null;
		this._dbPromise = null;
		this._connected = false;
	}
}
