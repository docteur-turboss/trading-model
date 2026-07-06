import { createHash } from "node:crypto";

import { ObjectId } from "mongodb";

import { getCollection } from "../config/db";
import { env } from "../config/env";
import { DLQ_STATUS } from "./dlq-status";
import type { DlqEntry } from "./repository";

export class DlqCapacityError {
	public readonly name: string;
	public readonly message: string;
	public readonly stack?: string;

	constructor(message: string) {
		const error = new Error(message);
		this.name = "DlqCapacityError";
		this.message = error.message;
		this.stack = error.stack;
	}
}

export function dlqCapacityError(message: string): DlqCapacityError {
	return new DlqCapacityError(message);
}

const DLQ_MAX_PASS_COUNT = 3;

interface PingPongCheck {
	col: import("mongodb").Collection;
	contentHash: string;
	entry: DlqEntry;
	messageId: string;
	serialized: string;
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

export class DlqEntryWriter {
	async add(entry: DlqEntry): Promise<string> {
		const col = await getCollection();

		if (await this._isCapacityReached(col)) {
			throw dlqCapacityError("DLQ capacity limit reached");
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

	private async _checkPingPong(
		options: PingPongCheck
	): Promise<Record<string, unknown>> {
		const { col, contentHash, entry, messageId, serialized } = options;
		const prevCompleted = await col.findOne(
			{
				contentHash,
				status: { $in: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED] },
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
			doc.status = DLQ_STATUS.ABANDONED;
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
}
