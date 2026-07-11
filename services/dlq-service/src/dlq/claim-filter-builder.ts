import type {
	InstanceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import { type AnyBulkWriteOperation, ObjectId } from "mongodb";
import { ENV } from "../config/env";
import { DLQ_MAX_CONSECUTIVE_ERRORS } from "./dlq-constants";
import { DlqStatus } from "./dlq-status";

export class ClaimFilterBuilder {
	buildClaimFilter(topic?: Topic): Record<string, unknown> {
		const statusFilter: Record<string, unknown> = {
			$nin: [DlqStatus.Completed, DlqStatus.Abandoned],
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
			status: { $nin: [DlqStatus.Completed, DlqStatus.Abandoned] },
			consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
		};
	}

	buildBulkUpdateOps(
		candidates: Pick<{ _id: ObjectId }, "_id">[],
		now: Date,
		instanceId: InstanceId,
		batchId: string
	): AnyBulkWriteOperation[] {
		const atomicCond = this.buildAtomicCondition();
		return candidates.map((doc) => ({
			updateOne: {
				filter: { _id: doc.objectId, ...atomicCond },
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
