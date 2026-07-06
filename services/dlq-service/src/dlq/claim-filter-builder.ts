import {
	type AnyBulkWriteOperation,
	type Document,
	ObjectId,
	type WithId,
} from "mongodb";

import { env } from "../config/env";
import type { StoredDlqEntry } from "./repository";

const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

export class ClaimFilterBuilder {
	buildClaimFilter(topic?: string): Record<string, unknown> {
		const statusFilter: Record<string, unknown> = {
			$nin: ["completed", "abandoned"],
		};
		const filter: Record<string, unknown> = {
			retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
			processingAt: { $exists: false },
			status: statusFilter,
			consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
		};
		if (topic) {
			filter.topic = topic;
		}
		return filter;
	}

	buildAtomicCondition(): Record<string, unknown> {
		return {
			retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
			processingAt: { $exists: false },
			status: { $nin: ["completed", "abandoned"] },
			consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
		};
	}

	buildBulkUpdateOps(
		candidates: Pick<{ _id: ObjectId }, "_id">[],
		now: Date,
		instanceId: string,
		batchId: string
	): AnyBulkWriteOperation[] {
		const atomicCond = this.buildAtomicCondition();
		return candidates.map((doc) => ({
			updateOne: {
				filter: { _id: doc._id, ...atomicCond },
				update: {
					$set: {
						processingAt: now,
						processingInstance: instanceId,
						lastBatchId: batchId,
					},
				},
			},
		}));
	}

	toValidObjectIds(ids: string[]): ObjectId[] {
		return ids
			.filter((id) => ObjectId.isValid(id))
			.map((id) => new ObjectId(id));
	}

	toStoredDlqEntry(doc: WithId<Document>): StoredDlqEntry {
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
}
