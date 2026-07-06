import type { Document, Filter } from "mongodb";
import { ObjectId, type WithId } from "mongodb";

import type { UnixTimestamp } from "@trading-model/common/domain/primitives";
import { getCollection } from "../config/db";
import { env } from "../config/env";
import {
	DlqCapacityError,
	DlqEntryWriter,
	dlqCapacityError,
} from "./dlq-entry-writer";
import { DLQ_STATUS } from "./dlq-status";

export { DlqCapacityError, dlqCapacityError };

export function isDlqCapacityError(err: unknown): err is DlqCapacityError {
	return err instanceof DlqCapacityError;
}

export interface DlqEntry {
	id?: string;
	topic?: string;
	message: unknown;
	reason?: string;
	deliveryAttempt: number;
	timestamp: UnixTimestamp;
	messageId?: string;
}

export type { DlqStatus } from "./dlq-status";
export { DLQ_STATUS } from "./dlq-status";

export const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

export interface StoredDlqEntry {
	id: string;
	topic: string | null;
	message: unknown;
	reason: string | null;
	deliveryAttempt: number;
	createdAt: UnixTimestamp;
}

export interface DlqListOptions {
	topic?: string;
	limit?: number;
	offset?: number;
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
			retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
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
		const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
		return {
			_id: { $in: objectIds },
			processingAt: { $exists: false },
		};
	}
}

export class DlqRepository {
	private _entryWriter = new DlqEntryWriter();
	private _queryBuilder = new DlqQueryBuilder();

	async add(entry: DlqEntry): Promise<string> {
		return this._entryWriter.add(entry);
	}

	async list(options?: DlqListOptions): Promise<StoredDlqEntry[]> {
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
		const col = await getCollection();
		const eldest = await col
			.find(
				{},
				{
					sort: { createdAt: -1 },
					skip: maxEntries,
					limit: 1,
					projection: { createdAt: 1 },
				}
			)
			.toArray();
		if (eldest.length === 0) return 0;
		const result = await col.deleteMany({
			createdAt: { $lt: eldest[0].createdAt },
			processingAt: { $exists: false },
		});
		return result.deletedCount;
	}

	async listQueuable(): Promise<string[]> {
		const col = await getCollection();
		const query = this._queryBuilder.buildQueuableQuery();
		const docs = await col
			.find(query, {
				sort: { createdAt: -1 },
				limit: env.DLQ_AUTO_RETRY_LIMIT * 10,
				projection: { _id: 1 },
			})
			.toArray();
		return docs.map((doc) => doc._id.toHexString());
	}

	async listActiveClaimIds(): Promise<string[]> {
		const col = await getCollection();
		const query = this._queryBuilder.buildActiveClaimQuery();
		const docs = await col
			.find(query, { projection: { _id: 1 } })
			.toArray();
		return docs.map((doc) => doc._id.toHexString());
	}
}

export const dlqRepository = new DlqRepository();
