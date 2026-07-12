import { URLString } from "@trading-model/common/domain/primitives";
import { MongoConnectionManager } from "@trading-model/common/persistence/mongo-connection-manager";
import type { MongoClient } from "mongodb";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";

export class MongoClientManager {
	private _manager: MongoConnectionManager | null = null;
	private _client: MongoClient | null = null;

	get client(): MongoClient | null {
		return this._client;
	}

	canStart(): boolean {
		if (!ENV.MONGO_ARCHIVE_URI) {
			logger.info("MongoDB archival not configured — skipping");
			return false;
		}
		if (this._client) {
			return false;
		}
		return true;
	}

	handleStartError(err: Error): void {
		logger.warn(
			"MongoDB archival store failed to start — continuing without archival",
			{ error: err.message }
		);
	}

	async connectClient(): Promise<void> {
		this._manager = new MongoConnectionManager({
			uri: URLString.of(ENV.MONGO_ARCHIVE_URI!),
			dbName: ENV.MONGO_ARCHIVE_DB,
		});
		this._client = await this._manager.getConnection();
		logger.info("MongoDB archival store connected");
	}

	async ensureIndexes(): Promise<void> {
		if (!this._client) {
			this._logMissingClient();
			return;
		}
		try {
			await this._ensureArchiveWriter();
		} catch (err) {
			this._logIndexError(err as Error);
		}
	}

	private _logMissingClient(): void {
		logger.warn("MongoDB client not initialized — skipping index creation");
	}

	private async _ensureArchiveWriter(): Promise<void> {
		const { MongoArchiveBatchWriter } = await import(
			"./mongo-archive-batch.js"
		);
		const writer = new MongoArchiveBatchWriter({
			client: this._client!,
			dbName: ENV.MONGO_ARCHIVE_DB,
			collectionName: ENV.MONGO_ARCHIVE_COLLECTION,
		});
		await writer.createIndexes();
		logger.info("MongoDB archive indexes ensured");
	}

	private _logIndexError(err: Error): void {
		logger.warn("Failed to create archive indexes", {
			context: {
				error: err.message,
			},
		});
	}

	async closeClient(): Promise<void> {
		if (!this._manager) {
			return;
		}
		try {
			await this._manager.close();
		} catch {
			logger.debug("Mongo client close error (best-effort)");
		}
		this._client = null;
		this._manager = null;
	}
}
