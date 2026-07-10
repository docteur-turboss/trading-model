import { type Db, MongoClient } from "mongodb";
import { logger } from "../config/logger";
import { ConnectionManager } from "./connection-manager";
import { createPoolOptions, resolvePoolSize } from "./mongo-utils";

export interface MongoConnectionConfig {
	uri: string;
	dbName: string;
	poolSize?: number;
	minPoolSize?: number;
	serverSelectionTimeoutMS?: number;
	connectTimeoutMS?: number;
}

export class MongoConnectionManager extends ConnectionManager<MongoClient> {
	private _db: Db | null = null;
	private _dbName: string;
	private readonly _uri: string;
	private readonly _poolSize: number;
	private readonly _minPoolSize?: number;

	constructor(config: MongoConnectionConfig) {
		const poolSize = resolvePoolSize(config.poolSize);
		super(
			async () => {
				const client = new MongoClient(
					config.uri,
					createPoolOptions(poolSize, config.minPoolSize)
				);
				client.on("close", () => {
					this._connected = false;
				});
				client.on("reconnect", () => {
					this._connected = true;
				});
				await client.connect();
				logger.info("MongoDB connection established", {
					database: config.dbName,
					poolSize,
				});
				return client;
			},
			async (client) => { await client.close(); },
			{
				maxRetries: 10,
				baseDelayMs: 1000,
				maxDelayMs: 30000,
			}
		);
		this._dbName = config.dbName;
		this._uri = config.uri;
		this._poolSize = poolSize;
		this._minPoolSize = config.minPoolSize;
	}

	get uri(): string {
		return this._uri;
	}

	get poolSize(): number {
		return this._poolSize;
	}

	async getDb(): Promise<Db> {
		const client = await this.getConnection();
		if (!this._db) {
			this._db = client.db(this._dbName);
		}
		return this._db;
	}

	protected _clearState(): void {
		super._clearState();
		this._db = null;
	}
}
