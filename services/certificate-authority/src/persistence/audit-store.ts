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

	private async _tryConnect(): Promise<boolean> {
		try {
			if (!MONGO_MANAGER.isInitialized()) {
				await this._client.connect();
			}
			const db = MONGO_MANAGER.isInitialized()
				? MONGO_MANAGER.getDb()
				: this._client.db();
			this._collection = db.collection<AuditEntry>("audit_log");
			await this._collection.createIndex(
				{ timestamp: -1 },
				{ expireAfterSeconds: 90 * 86400 }
			);
			await this._collection.createIndex({ serviceId: 1, timestamp: -1 });
			await this._collection.createIndex({ serialNumber: 1 });
			this._mongoConnected = true;
			return true;
		} catch (err) {
			logger.error(
				"AuditStore: MongoDB connection failed — using local buffer",
				{ err }
			);
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
			logger.error("AuditStore: MongoDB write failed — buffering entry", {
				err,
			});
			this._mongoConnected = false;
			this._buffer(entry);
		}
	}

	private _buffer(entry: AuditEntry): void {
		if (this._pendingEntries.length >= this._maxBuffer) {
			const dropped = this._pendingEntries.shift()!;
			logger.warn("AuditStore: buffer full, dropping oldest entry", {
				action: dropped.action,
				serialNumber: dropped.serialNumber,
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
			// Re-buffer entries that failed to write
			this._pendingEntries.unshift(...batch);
			if (this._pendingEntries.length > this._maxBuffer) {
				const dropped = this._pendingEntries.splice(this._maxBuffer);
				logger.warn("AuditStore: flush failed, dropped entries", {
					count: dropped.length,
					err,
				});
			} else {
				logger.error("AuditStore: flush failed, entries re-buffered", {
					count: batch.length,
					err,
				});
			}
		}
	}
}
