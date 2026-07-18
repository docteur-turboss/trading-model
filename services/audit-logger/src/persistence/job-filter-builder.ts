import type { QueryEnvelope } from "@trading-model/common/domain/pagination";
import type {
	InstanceId,
	JobType,
} from "@trading-model/common/domain/primitives";
import type { JobStatus } from "@trading-model/validation/contracts/recovery.types";
import { MongoFilterBuilder } from "./mongo-filter-builder";

type MongoDoc = Record<string, unknown>;

export interface JobQuery extends QueryEnvelope {
	status?: JobStatus;
	type?: JobType;
	assignedWorkerId?: InstanceId;
}

export class JobFilterBuilder extends MongoFilterBuilder<JobQuery> {
	build(params: JobQuery): MongoDoc {
		const filter: MongoDoc = {};

		this._addIfPresent(filter, "status", params.status);
		this._addIfPresent(filter, "type", params.type);
		this._addIfPresent(filter, "assignedWorkerId", params.assignedWorkerId);
		this._addDateRangeFilter(filter, params.dateRange, "createdAt");

		return filter;
	}
}
