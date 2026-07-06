import { logger } from "@trading-model/common/config/logger";
import { type Collection, MongoClient } from "mongodb";

import { MONGO_MANAGER } from "./mongo-manager";
import { AuditBuffer } from "./audit-buffer";

export interface AuditEntry {
	action: "sign" | "revoke" | "renew" | "rotate" | "ca_key_rotation";
	serviceId: string;
	serialNumber: string;
	clientIdentity?: string;
	requestId?: string;
	success: boolean;
	errorMessage?: string;
	timestamp: Date;
}

export class AuditStore {
	private _client: MongoClient;
	private _collection: Collection<AuditEntry> | null = null;
	private get _requiredCollection(): Collection<AuditEntry> {
		if (!this._collection) throw new Error("AuditStore not connected");
		return this._collection;
	}
	private _mongoConnected = false;
	private readonly _buffer = new AuditBuffer();

	constructor(uri: string) {
		this._client = MONGO_MANAGER.isInitialized()
			? MONGO_MANAGER.getClient()
			: new MongoClient(uri);
		this._buffer.start(() => this._flush());
	}

	async connect(): Promise<void> {
		await this._tryConnect();
	}

	private _resolveDb(): import("mongodb").Db {
		return MONGO_MANAGER.isInitialized() ? MONGO_MANAGER.getDb() : this._client.db();
	}

	private async _ensureClientConnected(): Promise<void> {
		if (!MONGO_MANAGER.isInitialized()) {
			await this._client.connect();
		}
	}

	private async _createAuditIndexes(): Promise<void> {
		await this._requiredCollection.createIndex({ timestamp: -1 }, { expireAfterSeconds: 90 * 86400 });
		await this._requiredCollection.createIndex({ serviceId: 1, timestamp: -1 });
		await this._requiredCollection.createIndex({ serialNumber: 1 });
	}

	private async _tryConnect(): Promise<boolean> {
		try {
			await this._ensureClientConnected();
			this._collection = this._resolveDb().collection<AuditEntry>("audit_log");
			await this._createAuditIndexes();
			this._mongoConnected = true;
			return true;
		} catch (err) {
			logger.error("AuditStore: MongoDB connection failed — using local buffer", { context: { err } });
			this._mongoConnected = false;
			return false;
		}
	}

	private async _ensureMongo(): Promise<boolean> {
		if (this._mongoConnected) {
			return true;
		}
		return await this._tryConnect();
	}

	async disconnect(): Promise<void> {
		await this._flush();
		this._buffer.stop();
		if (!MONGO_MANAGER.isInitialized()) {
			try {
				await this._client.close();
			} catch {
				/* closing */
			}
		}
	}

	async add(entry: AuditEntry): Promise<void> {
		await this.log(entry);
	}

	async save(entry: AuditEntry): Promise<void> {
		await this.log(entry);
	}

	async log(entry: AuditEntry): Promise<void> {
		if (!((await this._ensureMongo()) && this._collection)) {
			this._buffer.buffer(entry);
			return;
		}
		try {
			await this._collection.insertOne(entry);
		} catch (err) {
			logger.error("AuditStore: MongoDB write failed — buffering entry", { context: { err } });
			this._mongoConnected = false;
			this._buffer.buffer(entry);
		}
	}

	private async _flush(): Promise<void> {
		if (this._buffer.pendingCount === 0) {
			return;
		}
		if (!((await this._ensureMongo()) && this._collection)) {
			return;
		}
		const batch = this._buffer.drain();
		try {
			await this._collection.insertMany(batch, { ordered: false });
		} catch (err) {
			this._buffer.rebuffer(batch, err);
		}
	}
}
