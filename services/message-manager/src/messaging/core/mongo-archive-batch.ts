import type { EventEnumMap } from "@trading-model/common/config/event.types";
import type { Message } from "@trading-model/common/contracts/message.types";
import type { Topic } from "@trading-model/common/domain/primitives";
import { ENV } from "../../config/env";
import { MongoBatchWriter } from "./mongo-batch-writer";

const MS_PER_DAY = 86_400_000;

import { MongoIndexCreator } from "./mongo-index-creator";
import type { MongoCollectionConfig } from "./mongo-types";

export interface ArchiveEntry {
	messageId: string;
	topic: Topic;
	eventType: EventEnumMap;
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

	constructor(config: MongoCollectionConfig) {
		this._indexCreator = new MongoIndexCreator(config);
		this._batchWriter = new MongoBatchWriter(config);
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
		ttl: new Date(Date.now() + ENV.MONGO_ARCHIVE_RETENTION_DAYS * MS_PER_DAY),
	};
}
