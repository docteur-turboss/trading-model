import { getLogger } from "@trading-model/contracts/logger-registry";
import { DurationMs } from "@trading-model/primitives/primitives";
import { type Db, MongoClient } from "mongodb";
import { ConnectionManager } from "./connection-manager";
import { createPoolOptions, resolvePoolSize } from "./mongo-utils";

export interface MongoConnectionConfig {
	/**
	 * MongoDB connection string. Not a URLString: a replica set lists several
	 * hosts (`mongodb://a:27017,b:27017/db`), which is no WHATWG URL.
	 */
	uri: string;
	dbName: string;
	collectionName?: string;
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
	private readonly _collectionName?: string;

	constructor(config: MongoConnectionConfig) {
		const poolSize = resolvePoolSize(config.poolSize);
		super(
			async () => {
				const client = new MongoClient(
					config.uri,
					createPoolOptions(poolSize, config.minPoolSize)
				);
				// The driver reconnects on its own and emits no "reconnect": follow
				// the topology it monitors instead.
				client.on("topologyDescriptionChanged", (event) => {
					this._connected = event.newDescription.hasDataBearingServers;
				});
				await client.connect();
				getLogger().info("MongoDB connection established", {
					database: config.dbName,
					poolSize,
				});
				return client;
			},
			async (client) => {
				await client.close();
			},
			{
				maxRetries: 10,
				baseDelayMs: DurationMs.of(1000),
				maxDelayMs: DurationMs.of(30000),
			}
		);
		this._dbName = config.dbName;
		this._uri = config.uri;
		this._poolSize = poolSize;
		this._collectionName = config.collectionName;
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

	protected get collectionName(): string | undefined {
		return this._collectionName;
	}

	async tryReconnect(): Promise<boolean> {
		await this.resetState();
		// biome-ignore lint/plugin: callers react to the boolean; getConnection already logs the cause
		try {
			await this.getConnection();
			return true;
		} catch {
			return false;
		}
	}

	protected _clearState(): void {
		super._clearState();
		this._db = null;
	}
}
