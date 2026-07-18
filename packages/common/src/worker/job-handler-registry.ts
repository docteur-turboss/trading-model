import type { JobId, JobType } from "../domain/primitives";

export type JobHandler<TData = unknown> = (job: {
	id: JobId;
	type: JobType;
	payload: TData;
}) => Promise<unknown>;
