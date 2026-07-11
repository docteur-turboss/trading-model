import type { DlqEntry } from "@trading-model/common/contracts/dlq.types";
import {
	SequenceNumber,
	Topic,
	type UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { AppError } from "@trading-model/common/utils/errors";
import type { Document, WithId } from "mongodb";
import { getCollection } from "../config/db";
import { DlqEntryWriter, dlqCapacityError } from "./dlq-entry-writer";
import { pruneEntries } from "./dlq-eviction-policy";
import { type DlqListOptions, DlqQueryBuilder } from "./dlq-query-builder";
import { DlqQueueRepository } from "./dlq-queue-repository";

export { DlqQueryBuilder } from "./dlq-query-builder";
export { DlqQueueRepository } from "./dlq-queue-repository";
export type { DlqListOptions };
export { dlqCapacityError };

export function isDlqCapacityError(err: unknown): err is AppError {
	return err instanceof AppError && err.code === "DlqCapacityError";
}

export { DlqStatus } from "./dlq-status";
export type { DlqEntry };

export interface StoredDlqEntry {
	id: string;
	topic: Topic | null;
	message: unknown;
	reason: string | null;
	deliveryAttempt: SequenceNumber;
	createdAt: UnixTimestamp;
}

export function toStoredDlqEntry(doc: WithId<Document>): StoredDlqEntry {
	return {
		id: doc._id.toHexString(),
		topic: doc.topic ? Topic.of(doc.topic as string) : null,
		message: doc.message,
		reason: (doc.reason as string | null) ?? null,
		deliveryAttempt: SequenceNumber.of(doc.deliveryAttempt as number),
		createdAt:
			(doc.createdAt as Date | undefined)?.toISOString() ??
			new Date().toISOString(),
	};
}

export class DlqRepository {
	private _entryWriter = new DlqEntryWriter();
	private _queryBuilder = new DlqQueryBuilder();
	private _queueRepository = new DlqQueueRepository(this._queryBuilder);

	get queryBuilder(): DlqQueryBuilder {
		return this._queryBuilder;
	}

	get queueRepository(): DlqQueueRepository {
		return this._queueRepository;
	}

	insert(entry: DlqEntry): Promise<string> {
		return this._entryWriter.insert(entry);
	}

	async query(options?: DlqListOptions): Promise<StoredDlqEntry[]> {
		const { limit = 100, offset = 0 } = options ?? {};
		const col = await getCollection();
		const query = this._queryBuilder.buildListQuery(options);

		const docs = await col
			.find(query, {
				sort: { createdAt: -1 },
				skip: options?.before ? 0 : offset,
				limit: Math.min(limit, 1000),
			})
			.toArray();

		return docs.map(toStoredDlqEntry);
	}

	async delete(ids: string[]): Promise<number> {
		const col = await getCollection();
		const query = this._queryBuilder.buildDeleteQuery(ids);
		const result = await col.deleteMany(query);
		return result.deletedCount;
	}

	async count(): Promise<number> {
		const col = await getCollection();
		return col.estimatedDocumentCount();
	}

	prune(maxEntries: number): Promise<number> {
		return pruneEntries(maxEntries);
	}

	listQueuable(): Promise<string[]> {
		return this._queueRepository.listQueuable();
	}

	listActiveClaimIds(): Promise<string[]> {
		return this._queueRepository.listActiveClaimIds();
	}
}

export const dlqRepository = new DlqRepository();
