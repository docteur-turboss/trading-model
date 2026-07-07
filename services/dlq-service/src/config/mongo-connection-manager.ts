import { ConnectionManager } from "@trading-model/common/persistence/connection-manager";
import { type Db, MongoClient } from "mongodb";

import { ENV } from "./env";
import { logger } from "./logger";

export class MongoConnectionManager extends ConnectionManager<MongoClient> {
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
}
