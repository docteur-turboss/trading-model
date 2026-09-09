import type { OffsetPagination } from "@trading-model/common/domain/pagination";
import type {
	InstanceId,
	Topic,
} from "@trading-model/common/domain/primitives";
import type { AnyBulkWriteOperation, Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";
import { DLQ_MAX_CONSECUTIVE_ERRORS } from "../../domain/dlq-constants";
import { DlqStatus } from "../../domain/dlq-status";
import { ENV } from "../../infrastructure/config/env";

export interface DlqListOptions extends Partial<OffsetPagination> {
	topic?: Topic;
	before?: string;
}

export class DlqQueryBuilder {
	buildListQuery(options?: DlqListOptions): Filter<Document> {
		const query: Filter<Document> = {};
		if (options?.topic) {
			query.topic = options.topic;
		}
		if (options?.before && ObjectId.isValid(options.before)) {
			query._id = { $lt: new ObjectId(options.before) };
		}
		return query;
	}

	buildQueuableQuery(): Filter<Document> {
		return {
			retryCount: { $lt: ENV.DLQ_RETRY_MAX_ATTEMPTS },
			processingAt: { $exists: false },
			status: { $nin: [DlqStatus.Completed, DlqStatus.Abandoned] },
			consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
		};
	}

	buildClaimFilter(topic?: Topic): Record<string, unknown> {
		const filter: Record<string, unknown> = this.buildQueuableQuery();
		if (topic) {
			filter.topic = topic;
		}
		return filter;
	}

	buildActiveClaimQuery(): Filter<Document> {
		return {
			processingAt: { $exists: true },
			status: { $nin: [DlqStatus.Completed, DlqStatus.Abandoned] },
		};
	}

	buildDeleteQuery(ids: string[]): Filter<Document> {
		return {
			_id: { $in: this.toValidObjectIds(ids) },
			processingAt: { $exists: false },
		};
	}

	buildBulkUpdateOps(
		candidates: { _id: ObjectId }[],
		now: Date,
		instanceId: InstanceId,
		batchId: string
	): AnyBulkWriteOperation[] {
		const atomicCond = this.buildQueuableQuery();
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
