import { logger } from "@trading-model/common/config/logger";
import { type Collection, MongoClient } from "mongodb";
import type { LockDocument } from "./lock-backends";
import { MongoLockBackend } from "./lock-backends";
import { MONGO_MANAGER } from "./mongo-manager";

export class LockConnectionManager {
	private _client: MongoClient;
	private _collection: Collection<LockDocument> | null = null;
	readonly mongoBackend: MongoLockBackend;

	constructor(uri: string, _fallbackDir?: string) {
		this._client = new MongoClient(uri);
		this.mongoBackend = new MongoLockBackend(
			() => this._collection,
			() => {
				this._collection = null;
			}
		);
	}

	get isAvailable(): boolean {
		return this._collection !== null;
	}

	private async _connectViaManager(): Promise<void> {
		this._client = MONGO_MANAGER.getClient();
		const db = MONGO_MANAGER.getDb();
		this._collection = db.collection<LockDocument>("locks");
	}

	private async _connectDirectly(): Promise<void> {
		await this._client.connect();
		const db = this._client.db();
		this._collection = db.collection<LockDocument>("locks");
	}

	private async _createLockIndexes(): Promise<void> {
		if (!this._collection) {
			return;
		}
		await this._collection.createIndex({ name: 1 }, { unique: true });
		await this._collection.createIndex(
			{ expiresAt: 1 },
			{ expireAfterSeconds: 0 }
		);
	}

	async connect(): Promise<void> {
		try {
			if (MONGO_MANAGER.isInitialized()) {
				await this._connectViaManager();
			} else {
				await this._connectDirectly();
			}
			this.mongoBackend.setConnected(true);
			await this._createLockIndexes();
		} catch (err) {
			logger.warn("MongoDB lock connection failed", { context: { err } });
		}
	}

	async disconnect(): Promise<void> {
		if (!MONGO_MANAGER.isInitialized()) {
			try {
				await this._client.close();
			} catch {
				logger.debug("Mongo client close error during disconnect");
			}
		}
	}
}
