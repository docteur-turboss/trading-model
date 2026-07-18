import type { OffsetPagination } from "@trading-model/common/domain/pagination";
import type { Topic } from "@trading-model/common/domain/primitives";
import type { Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";
import { ENV } from "../config/env";
import { DLQ_MAX_CONSECUTIVE_ERRORS } from "./dlq-constants";
import { DlqStatus } from "./dlq-status";

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

	buildActiveClaimQuery(): Filter<Document> {
		return {
			processingAt: { $exists: true },
			status: { $nin: [DlqStatus.Completed, DlqStatus.Abandoned] },
		};
	}

	buildDeleteQuery(ids: string[]): Filter<Document> {
		const objectIds = ids
			.filter((id) => ObjectId.isValid(id))
			.map((id) => new ObjectId(id));
		return {
			_id: { $in: objectIds },
			processingAt: { $exists: false },
		};
	}
}
