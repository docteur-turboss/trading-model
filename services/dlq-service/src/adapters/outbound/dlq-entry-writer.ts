import {
	type AppError,
	createAppError,
	ErrorCode,
} from "@trading-model/common/utils/errors";
import { getCollection } from "../../config/db";
import { DLQ_MAX_PASS_COUNT } from "../../domain/dlq-constants";
import { DlqStatus } from "../../domain/dlq-status";
import { ENV } from "../../infrastructure/config/env";
import { EntrySerializer } from "../../shared/entry-serializer";
import { DedupInserter } from "./dedup-inserter";
import type { DlqEntry } from "./repository";

export function dlqCapacityError(message: string): AppError {
	return createAppError(message, { code: ErrorCode.DlqCapacity });
}

interface NewDlqDocument {
	messageId: string;
	contentHash: string;
	topic: string | null;
	message: unknown;
	reason: string | null;
	deliveryAttempt: number;
	retryCount: number;
	dlqPassCount: number;
	createdAt: Date;
	status?: DlqStatus;
	abandonedAt?: Date;
	lastError?: string;
}

async function _computeDlqPassCount(
	col: import("mongodb").Collection,
	contentHash: string
): Promise<number> {
	const prevCompleted = await col.findOne(
		{
			contentHash,
			status: { $in: [DlqStatus.Completed, DlqStatus.Abandoned] },
		},
		{ sort: { createdAt: -1 }, projection: { dlqPassCount: 1, _id: 1 } }
	);
	return (prevCompleted?.dlqPassCount ?? 0) + 1;
}

function _buildBaseDoc(
	entry: DlqEntry,
	hash: { messageId: string; contentHash: string },
	dlqPassCount: number
): NewDlqDocument {
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
	doc: NewDlqDocument,
	dlqPassCount: number
): void {
	if (dlqPassCount >= DLQ_MAX_PASS_COUNT) {
		doc.status = DlqStatus.Abandoned;
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

		return this._inserter.insert(
			col,
			doc as unknown as Record<string, unknown>,
			hash.messageId
		);
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
	): Promise<NewDlqDocument> {
		const dlqPassCount = await _computeDlqPassCount(col, hash.contentHash);
		const doc = _buildBaseDoc(entry, hash, dlqPassCount);
		_applyPingPongAbandon(doc, dlqPassCount);
		return doc;
	}
}
