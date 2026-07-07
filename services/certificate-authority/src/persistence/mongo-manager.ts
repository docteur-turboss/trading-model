import { logger } from "@trading-model/common/config/logger";
import {
	MongoConnectionManager,
} from "@trading-model/common/persistence/mongo-connection-manager";
import { type Db, MongoClient } from "mongodb";

function _extractDbName(uri: string): string {
	try {
		const path = new URL(uri).pathname.replace(/^\//, "");
		return path || "admin";
	} catch {
		return "admin";
	}
}

class MongoManager {
	private _manager: MongoConnectionManager | null = null;

	async initialize(uri: string, poolSizeParam?: number): Promise<void> {
		if (this._manager) {
			return;
		}
		const dbName = _extractDbName(uri);
		const poolSize = poolSizeParam ?? 50;
		this._manager = new MongoConnectionManager({
			uri,
			dbName,
			poolSize,
		});
		await this._manager.getConnection();
		logger.info("MONGO_MANAGER initialized", {
			context: { poolSize, database: dbName },
		});
	}

	private _requireManager(): MongoConnectionManager {
		if (!this._manager) {
			throw new Error(
				"MONGO_MANAGER not initialized. Call MONGO_MANAGER.initialize() first."
			);
		}
		return this._manager;
	}

	/** @deprecated Use getConnection() instead. */
	getClient(): MongoClient {
		const m = this._requireManager();
		const client = m.getClient();
		if (!client) {
			throw new Error("MONGO_MANAGER not initialized");
		}
		return client;
	}

	getDb(): Db {
		const m = this._requireManager();
		return m.getDb() as unknown as Db;
	}

	/** @deprecated Use isConnected() instead. */
	isInitialized(): boolean {
		return this._manager?.isConnected() ?? false;
	}

	isConnected(): boolean {
		return this._manager?.isConnected() ?? false;
	}

	getPoolSize(): number {
		return this._manager?.poolSize ?? 0;
	}

	getConnection(): Promise<MongoClient> {
		return this._requireManager().getConnection();
	}

	async tryReconnect(): Promise<boolean> {
		if (!this._manager) {
			return false;
		}
		await this._manager.resetState();
		try {
			await this._manager.getConnection();
			return true;
		} catch {
			logger.warn("MONGO_MANAGER reconnection failed");
			return false;
		}
	}

	async close(): Promise<void> {
		if (!this._manager) {
			return;
		}
		try {
			await this._manager.close();
		} catch (err) {
			logger.warn("MONGO_MANAGER close error", { context: { err } });
		}
		this._manager = null;
		logger.info("MONGO_MANAGER connection pool closed");
	}
}

export const MONGO_MANAGER = new MongoManager();
