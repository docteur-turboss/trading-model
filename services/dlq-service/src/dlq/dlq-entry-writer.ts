import { AppError } from "@trading-model/common/utils/errors";
import { getCollection } from "../config/db";
import { ENV } from "../config/env";
import { DedupInserter } from "./dedup-inserter";
import { DLQ_MAX_PASS_COUNT } from "./dlq-constants";
import { DLQ_STATUS } from "./dlq-status";
import { EntrySerializer } from "./entry-serializer";
import type { DlqEntry } from "./repository";

export function dlqCapacityError(message: string): AppError {
	return new AppError(message, { code: "DlqCapacityError" });
}

async function _computeDlqPassCount(
	col: import("mongodb").Collection,
	contentHash: string
): Promise<number> {
	const prevCompleted = await col.findOne(
		{
			contentHash,
			status: { $in: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED] },
		},
		{ sort: { createdAt: -1 }, projection: { dlqPassCount: 1, _id: 1 } }
	);
	return (prevCompleted?.dlqPassCount ?? 0) + 1;
}

function _buildBaseDoc(
	entry: DlqEntry,
	hash: { messageId: string; contentHash: string },
	dlqPassCount: number
): Record<string, unknown> {
	return {
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
}

function _applyPingPongAbandon(
	doc: Record<string, unknown>,
	dlqPassCount: number
): void {
	if (dlqPassCount >= DLQ_MAX_PASS_COUNT) {
		doc.status = DLQ_STATUS.ABANDONED;
		doc.abandonedAt = new Date();
		doc.lastError = `Ping-pong detected: message entered DLQ ${dlqPassCount} times`;
	}
}

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
		const dlqPassCount = await _computeDlqPassCount(col, hash.contentHash);
		const doc = _buildBaseDoc(entry, hash, dlqPassCount);
		_applyPingPongAbandon(doc, dlqPassCount);
		return doc;
	}
}
