import {
	type AppError,
	createAppError,
	ErrorCode,
} from "@trading-model/common/utils/errors";
import type { Collection } from "mongodb";
import { DLQ_MAX_PASS_COUNT, RELEASE_CLAIM } from "../../domain/dlq-constants";
import { DlqStatus } from "../../domain/dlq-status";
import { ENV } from "../../infrastructure/config/env";
import { EntrySerializer } from "../../shared/entry-serializer";
import type { CollectionProvider } from "./collection-provider";
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
	service: string | null;
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
	col: Collection,
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
		service: entry.service ?? null,
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

/**
 * A targeted replay keeps the original messageId (ADR-0043 §7), so a new
 * failure of the subscriber has the dedup key of the replayed entry: reopen
 * that entry (ADR-0070) instead of dropping the failure as a duplicate.
 * Returns the id of an existing entry, or null when none has this messageId.
 */
async function _reopenReplayed(
	col: Collection,
	doc: NewDlqDocument
): Promise<string | null> {
	const existing = await col.findOne(
		{ messageId: doc.messageId },
		{ projection: { status: 1, processingAt: 1, dlqPassCount: 1 } }
	);
	if (!existing) {
		return null;
	}
	const id = existing._id.toHexString();
	// Completed, or claimed by a replay still in flight; a Pending entry is
	// the same failure delivered twice, an Abandoned one stays abandoned.
	const replayed =
		existing.status === DlqStatus.Completed ||
		(existing.processingAt !== undefined &&
			existing.status !== DlqStatus.Abandoned);
	if (!replayed) {
		return id;
	}

	const reopened: NewDlqDocument = {
		...doc,
		dlqPassCount: (existing.dlqPassCount ?? 1) + 1,
	};
	_applyPingPongAbandon(reopened, reopened.dlqPassCount);
	// createdAt moves to the new failure: TTL and eviction age the entry from it.
	const { messageId: _m, contentHash: _c, ...set } = reopened;
	// Dropping the claim makes the in-flight replay's completion miss it.
	const unset = {
		completedAt: "",
		lastBatchId: "",
		consecutiveErrors: "",
		lastRetryAt: "",
		...RELEASE_CLAIM.$unset,
		...(reopened.status ? {} : { status: "", lastError: "" }),
	};
	await col.updateOne(
		{ _id: existing._id, dlqPassCount: existing.dlqPassCount },
		{ $set: set, $unset: unset }
	);
	return id;
}

export class DlqEntryWriter {
	private readonly _serializer = new EntrySerializer();
	private readonly _inserter = new DedupInserter();

	constructor(private readonly _getCollection: CollectionProvider) {}

	async insert(entry: DlqEntry): Promise<string> {
		const col = await this._getCollection();

		const hash = this._serializer.computeHash(entry);
		// Independent reads: one round trip of latency instead of two.
		const [capacityReached, doc] = await Promise.all([
			this._isCapacityReached(col),
			this._buildDoc(col, entry, hash),
		]);
		if (capacityReached) {
			throw dlqCapacityError("DLQ capacity limit reached");
		}

		const existingId = await _reopenReplayed(col, doc);
		if (existingId) {
			return existingId;
		}
		return this._inserter.insert(
			col,
			// as unknown as: Mongo driver document typing
			doc as unknown as Record<string, unknown>,
			hash.messageId
		);
	}

	private async _isCapacityReached(col: Collection): Promise<boolean> {
		const currentCount = await col.estimatedDocumentCount();
		return currentCount >= ENV.MAX_ENTRIES;
	}

	private async _buildDoc(
		col: Collection,
		entry: DlqEntry,
		hash: { messageId: string; contentHash: string }
	): Promise<NewDlqDocument> {
		const dlqPassCount = await _computeDlqPassCount(col, hash.contentHash);
		const doc = _buildBaseDoc(entry, hash, dlqPassCount);
		_applyPingPongAbandon(doc, dlqPassCount);
		return doc;
	}
}
