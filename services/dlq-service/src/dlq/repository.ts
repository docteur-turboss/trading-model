import type { Document } from "mongodb";
import { ObjectId, type WithId } from "mongodb";

import { getCollection } from "../config/db";
import { env } from "../config/env";
import { DlqCapacityError, dlqCapacityError, DlqEntryWriter } from "./dlq-entry-writer";

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
	timestamp: string;
	messageId?: string;
}

export type DlqStatus = "completed" | "abandoned";

export const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

export interface StoredDlqEntry {
	id: string;
	topic: string | null;
	message: unknown;
	reason: string | null;
	deliveryAttempt: number;
	createdAt: string;
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

export class DlqRepository {
	private _entryWriter = new DlqEntryWriter();

	async add(entry: DlqEntry): Promise<string> {
		return this._entryWriter.add(entry);
	}

	async list(
		topic?: string,
		limit = 100,
		offset = 0,
		before?: string
	): Promise<StoredDlqEntry[]> {
		const col = await getCollection();
		const query: Record<string, unknown> = {};
		if (topic) {
			query.topic = topic;
		}
		if (before && ObjectId.isValid(before)) {
			query._id = { $lt: new ObjectId(before) };
		}

		const docs = await col
			.find(query, {
				sort: { createdAt: -1 },
				skip: before ? 0 : offset,
				limit: Math.min(limit, 1000),
			})
			.toArray();

		return docs.map(toStoredDlqEntry);
	}

	async delete(ids: string[]): Promise<number> {
		const col = await getCollection();
		const objectIds = _toValidObjectIds(ids);
		if (objectIds.length === 0) {
			return 0;
		}
		const result = await col.deleteMany({
			_id: { $in: objectIds },
			processingAt: { $exists: false },
		});
		return result.deletedCount;
	}

	async count(): Promise<number> {
		const col = await getCollection();
		return col.estimatedDocumentCount();
	}

	async prune(maxEntries: number): Promise<number> {
		const col = await getCollection();
		const docs = await _findEldestDocs(col, maxEntries);
		if (docs.length === 0) {
			return 0;
		}
		return _deleteOlderThan(col, docs[0].createdAt);
	}

	async listQueuable(): Promise<string[]> {
		const col = await getCollection();
		const docs = await col
			.find(
				{
					retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
					processingAt: { $exists: false },
					status: { $nin: ["completed", "abandoned"] },
					consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
				},
				{
					sort: { createdAt: -1 },
					limit: env.DLQ_AUTO_RETRY_LIMIT * 10,
					projection: { _id: 1 },
				}
			)
			.toArray();
		return docs.map((doc) => doc._id.toHexString());
	}

	async listActiveClaimIds(): Promise<string[]> {
		const col = await getCollection();
		const docs = await col
			.find(
				{
					processingAt: { $exists: true },
					status: { $nin: ["completed", "abandoned"] },
				},
				{ projection: { _id: 1 } }
			)
			.toArray();
		return docs.map((doc) => doc._id.toHexString());
	}
}

function _toValidObjectIds(ids: string[]): ObjectId[] {
	return ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
}

async function _findEldestDocs(
	col: import("mongodb").Collection,
	maxEntries: number
): Promise<Array<{ createdAt: unknown }>> {
	return col
		.find(
			{},
			{
				sort: { createdAt: -1 },
				skip: maxEntries,
				limit: 1,
				projection: { createdAt: 1 },
			}
		)
		.toArray() as Promise<Array<{ createdAt: unknown }>>;
}

async function _deleteOlderThan(
	col: import("mongodb").Collection,
	eldestToKeep: unknown
): Promise<number> {
	const result = await col.deleteMany({
		createdAt: { $lt: eldestToKeep },
		processingAt: { $exists: false },
	});
	return result.deletedCount;
}

export const dlqRepository = new DlqRepository();
