import type { JobId, JobType } from "@trading-model/common/domain/primitives";

export type JobHandler<TData = unknown> = (job: {
	id: JobId;
	type: JobType;
	payload: TData;
}) => Promise<unknown>;
