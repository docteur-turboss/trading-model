import type { JobId, JobType } from "../domain/primitives";

export type JobHandler<TData = unknown> = (job: {
	id: JobId;
	type: JobType;
	payload: TData;
}) => Promise<unknown>;

export class JobHandlerRegistry {
	private readonly _handlers = new Map<JobType, JobHandler>();

	register<TPayload = unknown>(
		jobType: JobType,
		handler: JobHandler<TPayload>
	): void {
		this._handlers.set(jobType, handler as JobHandler);
	}

	get(jobType: JobType): JobHandler | undefined {
		return this._handlers.get(jobType);
	}
}
