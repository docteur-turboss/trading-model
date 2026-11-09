import type { DlqEntry } from "@trading-model/contracts/dlq-types";
import { SequenceNumber, Topic } from "@trading-model/primitives/primitives";
import type { Document, WithId } from "mongodb";
import type { CollectionProvider } from "./collection-provider";
import { DlqEntryWriter } from "./dlq-entry-writer";
import { pruneEntries } from "./dlq-eviction-policy";
import { type DlqListOptions, DlqQueryBuilder } from "./dlq-query-builder";
import { DlqQueueRepository } from "./dlq-queue-repository";

export { DlqStatus } from "../../domain/dlq-status";

export { isDlqCapacityError } from "../../shared/dlq-error-builder";
export type { DlqEntry, DlqListOptions };

export interface StoredDlqEntry {
	id: string;
	topic: Topic | null;
	message: unknown;
	/** Subscriber whose delivery failed; null on entries from before ADR-0043 (replayed to every subscriber). */
	service: string | null;
	reason: string | null;
	deliveryAttempt: SequenceNumber;
	/** ISO 8601, as listed by `GET /dlq`. */
	createdAt: string;
}

export function toStoredDlqEntry(doc: WithId<Document>): StoredDlqEntry {
	return {
		id: doc._id.toHexString(),
		topic: doc.topic ? Topic.of(doc.topic as string) : null,
		message: doc.message,
		service: (doc.service as string | null | undefined) ?? null,
		reason: (doc.reason as string | null) ?? null,
		deliveryAttempt: SequenceNumber.of(doc.deliveryAttempt as number),
		createdAt: (
			(doc.createdAt as Date | undefined) ?? new Date()
		).toISOString(),
	};
}

export class DlqRepository {
	private readonly _entryWriter: DlqEntryWriter;
	private readonly _queryBuilder = new DlqQueryBuilder();
	private readonly _queueRepository: DlqQueueRepository;

	constructor(private readonly _getCollection: CollectionProvider) {
		this._entryWriter = new DlqEntryWriter(_getCollection);
		this._queueRepository = new DlqQueueRepository(
			_getCollection,
			this._queryBuilder
		);
	}

	insert(entry: DlqEntry): Promise<string> {
		return this._entryWriter.insert(entry);
	}

	async query(options?: DlqListOptions): Promise<StoredDlqEntry[]> {
		const { limit = 100, offset = 0 } = options ?? {};
		const col = await this._getCollection();
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
		const col = await this._getCollection();
		const query = this._queryBuilder.buildDeleteQuery(ids);
		const result = await col.deleteMany(query);
		return result.deletedCount;
	}

	async count(): Promise<number> {
		const col = await this._getCollection();
		return col.estimatedDocumentCount();
	}

	prune(maxEntries: number): Promise<number> {
		return pruneEntries(this._getCollection, maxEntries);
	}

	listQueuable(): Promise<string[]> {
		return this._queueRepository.listQueuable();
	}

	listActiveClaimIds(): Promise<string[]> {
		return this._queueRepository.listActiveClaimIds();
	}
}
