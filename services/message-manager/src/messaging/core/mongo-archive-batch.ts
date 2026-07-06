import type { Message } from "@trading-model/common/contracts/message.types";
import { ENV } from "../../config/env";

import { MongoIndexCreator } from "./mongo-index-creator";
import { MongoBatchWriter } from "./mongo-batch-writer";

export interface ArchiveEntry {
	messageId: string;
	topic: string;
	eventType: string;
	producer: string;
	payload: unknown;
	metadata: Record<string, unknown>;
	archivedAt: Date;
	ttl: Date;
}

export interface MongoClient {
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

export class MongoArchiveBatchWriter {
	private readonly _indexCreator: MongoIndexCreator;
	private readonly _batchWriter: MongoBatchWriter;

	constructor(client: MongoClient, dbName: string, collectionName: string) {
		this._indexCreator = new MongoIndexCreator(client, dbName, collectionName);
		this._batchWriter = new MongoBatchWriter(client, dbName, collectionName);
	}

	async createIndexes(): Promise<void> {
		await this._indexCreator.createIndexes();
	}

	async _insertBatch(docs: unknown[]): Promise<void> {
		await this._batchWriter.insertBatch(docs);
	}

	async _bulkWriteWithRetry(bulkOps: unknown[]): Promise<void> {
		await this._batchWriter.bulkWriteWithRetry(bulkOps);
	}

	async _archiveToMongo(entries: ArchiveEntry[]): Promise<void> {
		await this._batchWriter.archiveToMongo(entries);
	}

	async writeArchiveBatch(messages: Message[]): Promise<void> {
		const entries = messages.map(_messageToArchiveEntry);
		await this._batchWriter.archiveToMongo(entries);
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
