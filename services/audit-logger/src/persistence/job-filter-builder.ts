import type { QueryEnvelope } from "@trading-model/common/domain/pagination";
import type {
	InstanceId,
	JobType,
} from "@trading-model/common/domain/primitives";
import type { JobStatus } from "@trading-model/validation/contracts/recovery.types";

type MongoDoc = Record<string, unknown>;

export interface JobQuery extends QueryEnvelope {
	status?: JobStatus;
	type?: JobType;
	assignedWorkerId?: InstanceId;
}

export function buildJobFilter(params: JobQuery): MongoDoc {
	const filter: MongoDoc = {};
	if (params.status) {
		filter.status = params.status;
	}
	if (params.type) {
		filter.type = params.type;
	}
	if (params.assignedWorkerId) {
		filter.assignedWorkerId = params.assignedWorkerId;
	}
	if (params.dateRange) {
		const rangeFilter: Record<string, Date | undefined> = {};
		if (params.dateRange.start) {
			rangeFilter.$gte = params.dateRange.start;
		}
		if (params.dateRange.end) {
			rangeFilter.$lte = params.dateRange.end;
		}
		filter.createdAt = rangeFilter;
	}
	return filter;
}
