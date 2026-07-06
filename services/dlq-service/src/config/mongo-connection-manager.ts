import { retryWithBackoff } from "@trading-model/common/utils/retry";
import { type Db, MongoClient } from "mongodb";

import { env } from "./env";
import { logger } from "./logger";
import { MongoConnectionState } from "./mongo-connection-state";

export class MongoConnectionManager {
	private readonly _state = new MongoConnectionState();

	async getDb(): Promise<Db> {
		if (this._state.db) {
			return this._state.db;
		}
		const existingDb =
			this._state.dbPromise === null ? null : await this._state.dbPromise;
		if (existingDb) {
			return existingDb;
		}

		this._state.dbPromise = this._connectToMongo();
		return this._state.dbPromise;
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
			},
		);

		if (!dbInstance) {
			return this._state.throwConnectError(lastError);
		}

		this._state.client = dbInstance.newClient;
		this._state.db = dbInstance.database;
		this._state.connected = true;
		logger.info("MongoDB connected", { database: env.MONGO_DB });
		return dbInstance.database;
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
		this._state.registerMongoEvents(newClient);
		return { newClient, database };
	}

	isConnected(): boolean {
		return this._state.isConnected();
	}

	async resetState(): Promise<void> {
		if (this._state.client) {
			try {
				await this._state.client.close();
			} catch {
			}
		}
		this._state.clearState();
	}

	async close(): Promise<void> {
		if (this._state.client) {
			try {
				await this._state.client.close();
			} catch (err) {
				logger.warn("Error closing MongoDB connection", {
					error: (err as Error).message,
				});
			}
			this._state.clearState();
			logger.info("MongoDB connection closed");
		}
	}
}
