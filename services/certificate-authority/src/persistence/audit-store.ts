import { logger } from "@trading-model/common/config/logger";
import { type Collection, MongoClient } from "mongodb";

import { MONGO_MANAGER } from "./mongo-manager";

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
	private _mongoConnected = false;
	private readonly _pendingEntries: AuditEntry[] = [];
	private _flushTimer: ReturnType<typeof setInterval> | null = null;
	private readonly _maxBuffer = 5000;
	private readonly _flushIntervalMs = 5000;
	private readonly _batchSize = 200;

	constructor(uri: string) {
		this._client = MONGO_MANAGER.isInitialized()
			? MONGO_MANAGER.getClient()
			: new MongoClient(uri);
		this._startFlushTimer();
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
		await this._collection!.createIndex({ timestamp: -1 }, { expireAfterSeconds: 90 * 86400 });
		await this._collection!.createIndex({ serviceId: 1, timestamp: -1 });
		await this._collection!.createIndex({ serialNumber: 1 });
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
		if (this._flushTimer) {
			clearInterval(this._flushTimer);
			this._flushTimer = null;
		}
		if (!MONGO_MANAGER.isInitialized()) {
			try {
				await this._client.close();
			} catch {
				/* closing */
			}
		}
	}

	async log(entry: AuditEntry): Promise<void> {
		if (!((await this._ensureMongo()) && this._collection)) {
			this._buffer(entry);
			return;
		}
		try {
			await this._collection.insertOne(entry);
		} catch (err) {
			logger.error("AuditStore: MongoDB write failed — buffering entry", { context: { err } });
			this._mongoConnected = false;
			this._buffer(entry);
		}
	}

	private _buffer(entry: AuditEntry): void {
		if (this._pendingEntries.length >= this._maxBuffer) {
			const dropped = this._pendingEntries.shift()!;
			logger.warn("AuditStore: buffer full, dropping oldest entry", {
				context: {
					action: dropped.action,
					serialNumber: dropped.serialNumber,
				},
			});
		}
		this._pendingEntries.push(entry);
	}

	private _startFlushTimer(): void {
		this._flushTimer = setInterval(() => this._flush(), this._flushIntervalMs);
		if (
			this._flushTimer &&
			typeof this._flushTimer === "object" &&
			"unref" in this._flushTimer
		) {
			this._flushTimer.unref();
		}
	}

	private _rebufferEntries(batch: AuditEntry[], err: unknown): void {
		this._pendingEntries.unshift(...batch);
		if (this._pendingEntries.length > this._maxBuffer) {
			const dropped = this._pendingEntries.splice(this._maxBuffer);
			logger.warn("AuditStore: flush failed, dropped entries", { context: { count: dropped.length, err } });
		} else {
			logger.error("AuditStore: flush failed, entries re-buffered", { context: { count: batch.length, err } });
		}
	}

	private async _flush(): Promise<void> {
		if (this._pendingEntries.length === 0) {
			return;
		}
		if (!((await this._ensureMongo()) && this._collection)) {
			return;
		}
		const batch = this._pendingEntries.splice(0, this._batchSize);
		try {
			await this._collection.insertMany(batch, { ordered: false });
		} catch (err) {
			this._rebufferEntries(batch, err);
		}
	}
}
