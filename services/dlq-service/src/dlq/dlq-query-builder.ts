import type { Document, Filter } from "mongodb";
import { ObjectId } from "mongodb";

import { ENV } from "../config/env";
import { DLQ_MAX_CONSECUTIVE_ERRORS } from "./dlq-constants";
import { DLQ_STATUS } from "./dlq-status";

export interface DlqListOptions {
	topic?: string;
	before?: string;
	limit?: number;
	offset?: number;
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
			status: { $nin: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED] },
			consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
		};
	}

	buildActiveClaimQuery(): Filter<Document> {
		return {
			processingAt: { $exists: true },
			status: { $nin: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED] },
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
