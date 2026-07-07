import { getCollection } from "../config/db";
import { ENV } from "../config/env";
import { DedupInserter } from "./dedup-inserter";
import { DLQ_STATUS } from "./dlq-status";
import { EntrySerializer } from "./entry-serializer";
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

export class DlqEntryWriter {
	private readonly _serializer = new EntrySerializer();
	private readonly _inserter = new DedupInserter();

	async insert(entry: DlqEntry): Promise<string> {
		const col = await getCollection();

		if (await this._isCapacityReached(col)) {
			throw dlqCapacityError("DLQ capacity limit reached");
		}

		const hash = this._serializer.computeHash(entry);
		const doc = await this._buildDoc(col, entry, hash);

		return this._inserter.insert(col, doc, hash.messageId);
	}

	private async _isCapacityReached(
		col: import("mongodb").Collection
	): Promise<boolean> {
		const currentCount = await col.estimatedDocumentCount();
		return currentCount >= ENV.MAX_ENTRIES;
	}

	private async _buildDoc(
		col: import("mongodb").Collection,
		entry: DlqEntry,
		hash: { messageId: string; contentHash: string }
	): Promise<Record<string, unknown>> {
		const prevCompleted = await col.findOne(
			{
				contentHash: hash.contentHash,
				status: { $in: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED] },
			},
			{ sort: { createdAt: -1 }, projection: { dlqPassCount: 1, _id: 1 } }
		);
		const dlqPassCount = (prevCompleted?.dlqPassCount ?? 0) + 1;

		const doc: Record<string, unknown> = {
			messageId: hash.messageId,
			contentHash: hash.contentHash,
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
}
