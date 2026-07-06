import { createHash } from "node:crypto";

import { type Document, ObjectId, type WithId } from "mongodb";

import { getCollection } from "../config/db";
import { env } from "../config/env";

export class DlqCapacityError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "DlqCapacityError";
		Object.setPrototypeOf(this, new.target.prototype);
	}
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

const DLQ_MAX_PASS_COUNT = 3;

interface PingPongCheck {
	col: import("mongodb").Collection;
	contentHash: string;
	entry: DlqEntry;
	messageId: string;
	serialized: string;
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
	async add(entry: DlqEntry): Promise<string> {
		const col = await getCollection();

		if (await this._isCapacityReached(col)) {
			throw new DlqCapacityError("DLQ capacity limit reached");
		}

		const { messageId, contentHash, serialized } =
			this._computeEntryHash(entry);
		const doc = await this._checkPingPong({
			col,
			contentHash,
			entry,
			messageId,
			serialized,
		});

		return this._insertWithDedup(col, doc, messageId);
	}

	private async _isCapacityReached(
		col: import("mongodb").Collection
	): Promise<boolean> {
		const currentCount = await col.estimatedDocumentCount();
		return currentCount >= env.MAX_ENTRIES;
	}

	private _computeEntryHash(entry: DlqEntry): {
		messageId: string;
		contentHash: string;
		serialized: string;
	} {
		const serialized = _serializeEntry(entry);
		const messageId = entry.messageId ?? _sha256Hex(serialized);
		const contentHash = _sha256Hex(serialized);
		return { messageId, contentHash, serialized };
	}
}

function _serializeEntry(entry: DlqEntry): string {
	return JSON.stringify({
		topic: entry.topic,
		message: entry.message,
		reason: entry.reason,
	});
}

function _sha256Hex(input: string): string {
	return createHash("sha256").update(input).digest("hex");
}

export class DlqRepository {

	private async _checkPingPong(
		options: PingPongCheck
	): Promise<Record<string, unknown>> {
		const { col, contentHash, entry, messageId, serialized } = options;
		const prevCompleted = await col.findOne(
			{
				contentHash,
				status: { $in: ["completed", "abandoned"] },
			},
			{ sort: { createdAt: -1 }, projection: { dlqPassCount: 1, _id: 1 } }
		);
		const dlqPassCount = (prevCompleted?.dlqPassCount ?? 0) + 1;

		const doc: Record<string, unknown> = {
			messageId,
			contentHash,
			topic: entry.topic ?? null,
			message: entry.message,
			reason: entry.reason ?? null,
			deliveryAttempt: entry.deliveryAttempt,
			retryCount: 0,
			dlqPassCount,
			createdAt: new Date(entry.timestamp),
		};

		if (dlqPassCount >= DLQ_MAX_PASS_COUNT) {
			doc.status = "abandoned";
			doc.abandonedAt = new Date();
			doc.lastError = `Ping-pong detected: message entered DLQ ${dlqPassCount} times`;
		}

		return doc;
	}

	private async _insertWithDedup(
		col: import("mongodb").Collection,
		doc: Record<string, unknown>,
		messageId: string
	): Promise<string> {
		const existing = await col.findOne(
			{ messageId },
			{ projection: { _id: 1 } }
		);
		if (existing) {
			return existing._id.toHexString();
		}

		try {
			const result = await col.insertOne(doc);
			return result.insertedId.toHexString();
		} catch (err: unknown) {
			if (
				err instanceof Error &&
				"code" in err &&
				(err as Record<string, unknown>).code === 11000
			) {
				const existingAfterRace = await col.findOne(
					{ messageId },
					{ projection: { _id: 1 } }
				);
				return existingAfterRace!._id.toHexString();
			}
			throw err;
		}
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
		const objectIds = ids
			.filter((id) => ObjectId.isValid(id))
			.map((id) => new ObjectId(id));
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
		const docs = await col
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
		if (docs.length === 0) {
			return 0;
		}
		const eldestToKeep = docs[0].createdAt;
		const result = await col.deleteMany({
			createdAt: { $lt: eldestToKeep },
			processingAt: { $exists: false },
		});
		return result.deletedCount;
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

export const dlqRepository = new DlqRepository();
