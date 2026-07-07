import { logger } from "../../config/logger";
import type { ArchiveEntry } from "./mongo-archive-batch";
import type { MongoCollectionConfig } from "./mongo-types";

const MaxBatchSize = 1000;
const MaxRetries = 3;
const RetryDelayMs = 1000;

export class MongoBatchWriter {
	constructor(private readonly _config: MongoCollectionConfig) {}

	private _getCollection(): ReturnType<
		ReturnType<MongoCollectionConfig["client"]["db"]>["collection"]
	> {
		return this._config.client
			.db(this._config.dbName)
			.collection(this._config.collectionName) as ReturnType<
			ReturnType<MongoCollectionConfig["client"]["db"]>["collection"]
		>;
	}

	async insertBatch(docs: unknown[]): Promise<void> {
		const col = this._getCollection();
		await this._insertWithRetry(col, docs, 0);
	}

	private async _insertWithRetry(
		col: ReturnType<
			ReturnType<MongoCollectionConfig["client"]["db"]>["collection"]
		>,
		docs: unknown[],
		attempt: number
	): Promise<void> {
		try {
			await (col as any).insertMany(docs);
		} catch (err) {
			this._handleInsertError(err, attempt);
		}
	}

	private _handleInsertError(err: unknown, attempt: number): void {
		logger.warn("MongoDB insert failed", {
			context: {
				error: (err as Error).message,
				attempt,
			},
		});
	}

	async bulkWriteWithRetry(bulkOps: unknown[]): Promise<void> {
		const col = this._getCollection();
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < MaxRetries; attempt++) {
			lastError = await this._tryBulkWrite(col, bulkOps, attempt);
			if (!lastError) {
				return;
			}
		}

		throw lastError;
	}

	private async _tryBulkWrite(
		col: any,
		bulkOps: unknown[],
		attempt: number
	): Promise<Error | null> {
		try {
			await col.bulkWrite(bulkOps);
			return null;
		} catch (err) {
			this._logBulkWriteWarning(err as Error, attempt);
			if (attempt < MaxRetries - 1) {
				await new Promise((resolve) => setTimeout(resolve, RetryDelayMs));
			}
			return err as Error;
		}
	}

	private _logBulkWriteWarning(err: Error, attempt: number): void {
		logger.warn("MongoDB bulkWrite failed — retrying", {
			context: {
				error: err.message,
				attempt: attempt + 1,
				maxRetries: MaxRetries,
			},
		});
	}

	async archiveToMongo(entries: ArchiveEntry[]): Promise<void> {
		for (let i = 0; i < entries.length; i += MaxBatchSize) {
			const batch = entries.slice(i, i + MaxBatchSize);
			const bulkOps = buildBulkUpserts(batch);
			if (bulkOps.length > 0) {
				await this.bulkWriteWithRetry(bulkOps);
			}
		}
	}
}

function buildBulkUpserts(entries: ArchiveEntry[]): Array<{
	updateOne: {
		filter: { messageId: string };
		update: { $setOnInsert: ArchiveEntry };
		upsert: true;
	};
}> {
	return entries
		.filter((entry) => entry.messageId)
		.map((entry) => upsertOperation(entry));
}

function upsertOperation(entry: ArchiveEntry): {
	updateOne: {
		filter: { messageId: string };
		update: { $setOnInsert: ArchiveEntry };
		upsert: true;
	};
} {
	return {
		updateOne: {
			filter: { messageId: entry.messageId },
			update: { $setOnInsert: entry },
			upsert: true,
		},
	};
}
