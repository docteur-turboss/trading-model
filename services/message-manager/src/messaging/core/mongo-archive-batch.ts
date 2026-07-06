import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";
import { logger } from "../../config/logger";

const SET_ON_INSERT = "$setOnInsert";

const _MAX_BATCH_SIZE = 1000;
const _MAX_RETRIES = 3;
const _RETRY_DELAY_MS = 1000;

interface ArchiveEntry {
	messageId: string;
	topic: string;
	eventType: string;
	producer: string;
	payload: unknown;
	metadata: Record<string, unknown>;
	archivedAt: Date;
	ttl: Date;
}

interface MongoClient {
	db: (name: string) => {
		collection: (name: string) => {
			insertMany: (docs: unknown[]) => Promise<unknown>;
			createIndex: (
				keys: Record<string, number>,
				opts?: Record<string, unknown>
			) => Promise<string>;
			countDocuments: (filter: Record<string, unknown>) => Promise<number>;
			deleteMany: (
				filter: Record<string, unknown>
			) => Promise<{ deletedCount: number }>;
			bulkWrite: (ops: unknown[]) => Promise<unknown>;
		};
	};
	close: () => Promise<void>;
}

export type { MongoClient };

export class MongoArchiveBatchWriter {
	private _client: MongoClient;
	private _dbName: string;
	private _collectionName: string;

	constructor(client: MongoClient, dbName: string, collectionName: string) {
		this._client = client;
		this._dbName = dbName;
		this._collectionName = collectionName;
	}

	_getCollection(): ReturnType<ReturnType<MongoClient["db"]>["collection"]> {
		return this._client
			.db(this._dbName)
			.collection(this._collectionName) as ReturnType<
				ReturnType<MongoClient["db"]>["collection"]
			>;
	}

	async createIndexes(): Promise<void> {
		const col = this._getCollection();
		await col.createIndex(
			{ messageId: 1 },
			{ unique: true, background: true }
		);
		await col.createIndex({ topic: 1, archivedAt: -1 }, { background: true });
		await col.createIndex(
			{ ttl: 1 },
			{ expireAfterSeconds: 0, background: true }
		);
	}

	async _insertBatch(docs: unknown[]): Promise<void> {
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
			this._handleInsertError(err, col, docs, attempt);
		}
	}

	async _bulkWriteWithRetry(bulkOps: unknown[]): Promise<void> {
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

	private _handleInsertError(
		err: unknown,
		_col: ReturnType<ReturnType<MongoClient["db"]>["collection"]>,
		_docs: unknown[],
		attempt: number
	): void {
		logger.warn("MongoDB insert failed", {
			context: {
				error: (err as Error).message,
				attempt,
			},
		});
	}

	async _archiveToMongo(entries: ArchiveEntry[]): Promise<void> {
		for (let i = 0; i < entries.length; i += _MAX_BATCH_SIZE) {
			const batch = entries.slice(i, i + _MAX_BATCH_SIZE);
			const bulkOps = _buildBulkUpserts(batch);
			if (bulkOps.length > 0) {
				await this._bulkWriteWithRetry(bulkOps);
			}
		}
	}

	async writeArchiveBatch(messages: Message[]): Promise<void> {
		const entries = messages.map(_messageToArchiveEntry);
		await this._archiveToMongo(entries);
	}
}

function _messageToArchiveEntry(msg: Message): ArchiveEntry {
	return {
		messageId: msg.metadata.messageId ?? "",
		topic: msg.metadata.topic,
		eventType: msg.metadata.eventType,
		producer: msg.metadata.publisher?.serviceName ?? "unknown",
		payload: msg.payload,
		metadata: msg.metadata as unknown as Record<string, unknown>,
		archivedAt: new Date(),
		ttl: new Date(Date.now() + ENV.MONGO_ARCHIVE_RETENTION_DAYS * 86400_000),
	};
}

function _buildBulkUpserts(entries: ArchiveEntry[]): Array<{
	updateOne: {
		filter: { messageId: string };
		update: { [SET_ON_INSERT]: ArchiveEntry };
		upsert: true;
	};
}> {
	return entries
		.filter((entry) => entry.messageId)
		.map((entry) => _upsertOperation(entry));
}

function _upsertOperation(entry: ArchiveEntry): {
	updateOne: {
		filter: { messageId: string };
		update: { [SET_ON_INSERT]: ArchiveEntry };
		upsert: true;
	};
} {
	return {
		updateOne: {
			filter: { messageId: entry.messageId },
			update: { [SET_ON_INSERT]: entry },
			upsert: true,
		},
	};
}
