import { logger } from "../../config/logger";
import type { MongoClient, ArchiveEntry } from "./mongo-archive-batch";

const _MAX_BATCH_SIZE = 1000;
const _MAX_RETRIES = 3;
const _RETRY_DELAY_MS = 1000;

export class MongoBatchWriter {
	constructor(
		private readonly _client: MongoClient,
		private readonly _dbName: string,
		private readonly _collectionName: string
	) {}

	private _getCollection(): ReturnType<
		ReturnType<MongoClient["db"]>["collection"]
	> {
		return this._client
			.db(this._dbName)
			.collection(this._collectionName) as ReturnType<
				ReturnType<MongoClient["db"]>["collection"]
			>;
	}

	async insertBatch(docs: unknown[]): Promise<void> {
		const col = this._getCollection();
		await this._insertWithRetry(col, docs, 0);
	}

	private async _insertWithRetry(
		col: ReturnType<ReturnType<MongoClient["db"]>["collection"]>,
		docs: unknown[],
		attempt: number
	): Promise<void> {
		try {
			await col.insertMany(docs);
		} catch (err) {
			this._handleInsertError(err, attempt);
		}
	}

	private _handleInsertError(
		err: unknown,
		attempt: number
	): void {
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

		for (let attempt = 0; attempt < _MAX_RETRIES; attempt++) {
			try {
				await col.bulkWrite(bulkOps);
				return;
			} catch (err) {
				lastError = err as Error;
				logger.warn("MongoDB bulkWrite failed — retrying", {
					context: {
						error: lastError.message,
						attempt: attempt + 1,
						maxRetries: _MAX_RETRIES,
					},
				});
				if (attempt < _MAX_RETRIES - 1) {
					await new Promise((resolve) =>
						setTimeout(resolve, _RETRY_DELAY_MS)
					);
				}
			}
		}

		throw lastError;
	}

	async archiveToMongo(entries: ArchiveEntry[]): Promise<void> {
		for (let i = 0; i < entries.length; i += _MAX_BATCH_SIZE) {
			const batch = entries.slice(i, i + _MAX_BATCH_SIZE);
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
