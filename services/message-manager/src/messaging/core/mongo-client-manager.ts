import { ENV } from "../../config/env";
import { logger } from "../../config/logger";
import type { MongoClient } from "mongodb";

export class MongoClientManager {
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
		const { MongoClient: MongoDriver } = await import("mongodb");
		this._client = new MongoDriver(
			ENV.MONGO_ARCHIVE_URI!
		) as unknown as MongoClient;
		await (
			this._client as unknown as { connect: () => Promise<void> }
		).connect();
		logger.info("MongoDB archival store connected");
	}

	async ensureIndexes(): Promise<void> {
		if (!this._client) {
			logger.warn("MongoDB client not initialized — skipping index creation");
			return;
		}
		try {
			const { MongoArchiveBatchWriter } = await import(
				"./mongo-archive-batch.js"
			);
			const writer = new MongoArchiveBatchWriter({
				client: this._client,
				dbName: ENV.MONGO_ARCHIVE_DB,
				collectionName: ENV.MONGO_ARCHIVE_COLLECTION,
			});
			await writer.createIndexes();
			logger.info("MongoDB archive indexes ensured");
		} catch (err) {
			logger.warn("Failed to create archive indexes", {
				context: {
					error: (err as Error).message,
				},
			});
		}
	}

	async closeClient(): Promise<void> {
		if (!this._client) {
			return;
		}
		try {
			await this._client.close();
		} catch {
			// best-effort
		}
	}
}
