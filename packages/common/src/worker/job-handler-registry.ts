export type JobHandler<TData = unknown> = (job: {
	id: string;
	type: string;
	payload: TData;
}) => Promise<unknown>;

export class JobHandlerRegistry {
	private readonly _handlers = new Map<string, JobHandler>();

	register<TPayload = unknown>(
		jobType: string,
		handler: JobHandler<TPayload>
	): void {
		this._handlers.set(jobType, handler as JobHandler);
	}

	get(jobType: string): JobHandler | undefined {
		return this._handlers.get(jobType);
	}
}
