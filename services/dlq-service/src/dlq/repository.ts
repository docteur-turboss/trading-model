import type { DlqEntry } from "@trading-model/common/contracts/dlq.types";
import type { OffsetPagination } from "@trading-model/common/domain/pagination";
import type { UnixTimestamp } from "@trading-model/common/domain/primitives";
import { AppError } from "@trading-model/common/utils/errors";
import type { Document, Filter } from "mongodb";
import { ObjectId, type WithId } from "mongodb";
import { getCollection } from "../config/db";
import { ENV } from "../config/env";
import { DLQ_MAX_CONSECUTIVE_ERRORS } from "./dlq-constants";
import { DlqEntryWriter, dlqCapacityError } from "./dlq-entry-writer";
import { pruneEntries } from "./dlq-eviction-policy";
import { DLQ_STATUS } from "./dlq-status";

export { dlqCapacityError };

export function isDlqCapacityError(err: unknown): err is AppError {
	return err instanceof AppError && err.code === "DlqCapacityError";
}

export type { DlqStatus } from "./dlq-status";
export { DLQ_STATUS } from "./dlq-status";
export type { DlqEntry };

export interface StoredDlqEntry {
	id: string;
	topic: string | null;
	message: unknown;
	reason: string | null;
	deliveryAttempt: number;
	createdAt: UnixTimestamp;
}

export interface DlqListOptions extends OffsetPagination {
	topic?: string;
	before?: string;
}

export function toStoredDlqEntry(doc: WithId<Document>): StoredDlqEntry {
	return {
		id: doc._id.toHexString(),
		topic: (doc.topic as string | null) ?? null,
		message: doc.message,
		reason: (doc.reason as string | null) ?? null,
		deliveryAttempt: doc.deliveryAttempt as number,
		createdAt:
			(doc.createdAt as Date | undefined)?.toISOString() ??
			new Date().toISOString(),
	};
}

export class DlqQueryBuilder {
	buildListQuery(options?: DlqListOptions): Filter<Document> {
		const query: Filter<Document> = {};
		if (options?.topic) {
			query.topic = options.topic;
		}
		if (options?.before && ObjectId.isValid(options.before)) {
			query._id = { $lt: new ObjectId(options.before) };
		}
		return query;
	}

	buildQueuableQuery(): Filter<Document> {
		return {
			retryCount: { $lt: ENV.DLQ_RETRY_MAX_ATTEMPTS },
			processingAt: { $exists: false },
			status: { $nin: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED] },
			consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
		};
	}

	buildActiveClaimQuery(): Filter<Document> {
		return {
			processingAt: { $exists: true },
			status: { $nin: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED] },
		};
	}

	buildDeleteQuery(ids: string[]): Filter<Document> {
		const objectIds = ids
			.filter((id) => ObjectId.isValid(id))
			.map((id) => new ObjectId(id));
		return {
			_id: { $in: objectIds },
			processingAt: { $exists: false },
		};
	}
}

export class DlqQueueRepository {
	private readonly _queryBuilder: DlqQueryBuilder;

	constructor(queryBuilder?: DlqQueryBuilder) {
		this._queryBuilder = queryBuilder ?? new DlqQueryBuilder();
	}

	async listQueuable(): Promise<string[]> {
		const col = await getCollection();
		const query = this._queryBuilder.buildQueuableQuery();
		const docs = await col
			.find(query, {
				sort: { createdAt: -1 },
				limit: ENV.DLQ_AUTO_RETRY_LIMIT * 10,
				projection: { _id: 1 },
			})
			.toArray();
		return docs.map((doc) => doc._id.toHexString());
	}

	async listActiveClaimIds(): Promise<string[]> {
		const col = await getCollection();
		const query = this._queryBuilder.buildActiveClaimQuery();
		const docs = await col.find(query, { projection: { _id: 1 } }).toArray();
		return docs.map((doc) => doc._id.toHexString());
	}
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

	async insert(entry: DlqEntry): Promise<string> {
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

	async prune(maxEntries: number): Promise<number> {
		return pruneEntries(maxEntries);
	}

	async listQueuable(): Promise<string[]> {
		return this._queueRepository.listQueuable();
	}

	async listActiveClaimIds(): Promise<string[]> {
		return this._queueRepository.listActiveClaimIds();
	}
}

export const dlqRepository = new DlqRepository();
