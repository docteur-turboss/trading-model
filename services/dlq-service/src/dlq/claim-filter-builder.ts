import {
	type AnyBulkWriteOperation,
	type Document,
	ObjectId,
} from "mongodb";

import { ENV } from "../config/env";
import { DLQ_STATUS } from "./dlq-status";
import { DLQ_MAX_CONSECUTIVE_ERRORS } from "./dlq-constants";

export class ClaimFilterBuilder {
	buildClaimFilter(topic?: string): Record<string, unknown> {
		const statusFilter: Record<string, unknown> = {
			$nin: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED],
		};
		const filter: Record<string, unknown> = {
			retryCount: { $lt: ENV.DLQ_RETRY_MAX_ATTEMPTS },
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
			retryCount: { $lt: ENV.DLQ_RETRY_MAX_ATTEMPTS },
			processingAt: { $exists: false },
			status: { $nin: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED] },
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
}
