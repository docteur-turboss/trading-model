import { logger } from "@trading-model/common/config/logger";
import { type Collection, MongoClient } from "mongodb";

import type { AuditEntry } from "./audit-store";
import { MONGO_MANAGER } from "./mongo-manager";

export class MongoAuditConnection {
	private _client: MongoClient;
	private _collection: Collection<AuditEntry> | null = null;

	constructor(uri: string) {
		this._client = MONGO_MANAGER.isInitialized()
			? MONGO_MANAGER.getClient()
			: new MongoClient(uri);
	}

	async connect(): Promise<void> {
		await this._tryConnect();
	}

	get collection(): Collection<AuditEntry> | null {
		return this._collection;
	}

	get mongoConnected(): boolean {
		return this._collection !== null;
	}

	private _resolveDb(): import("mongodb").Db {
		return MONGO_MANAGER.isInitialized()
			? MONGO_MANAGER.getDb()
			: this._client.db();
	}

	private async _ensureClientConnected(): Promise<void> {
		if (!MONGO_MANAGER.isInitialized()) {
			await this._client.connect();
		}
	}

	private async _createAuditIndexes(): Promise<void> {
		if (!this._collection) {
			return;
		}
		await this._collection.createIndex(
			{ timestamp: -1 },
			{ expireAfterSeconds: 90 * 86400 }
		);
		await this._collection.createIndex({
			serviceId: 1,
			timestamp: -1,
		});
		await this._collection.createIndex({ serialNumber: 1 });
	}

	async ensureMongo(): Promise<boolean> {
		if (this._collection) {
			return true;
		}
		return await this._tryConnect();
	}

	private async _tryConnect(): Promise<boolean> {
		try {
			await this._ensureClientConnected();
			this._collection = this._resolveDb().collection<AuditEntry>("audit_log");
			await this._createAuditIndexes();
			return true;
		} catch (err) {
			logger.error(
				"AuditStore: MongoDB connection failed — using local buffer",
				{ context: { err } }
			);
			this._collection = null;
			return false;
		}
	}

	async disconnect(): Promise<void> {
		if (!MONGO_MANAGER.isInitialized()) {
			try {
				await this._client.close();
			} catch {
				logger.debug("Mongo audit client close error during disconnect");
			}
		}
	}
}
