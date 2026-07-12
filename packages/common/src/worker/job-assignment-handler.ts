import type { SchedulerWsJobAssignedMessage } from "@trading-model/validation/contracts/worker-protocol.types";
import type { HttpClient } from "../config/http-client";
import type { JobId, JobType } from "../domain/primitives";
import { WorkerStatusCode } from "../domain/primitives";
import { JobHandlerRegistry } from "./job-handler-registry";
import { JobHttpClient, JobTracker } from "./job-tracker";

export class JobAssignmentHandler {
	private readonly _handlerRegistry = new JobHandlerRegistry();
	private readonly _jobTracker: JobTracker;
	private readonly _jobHttpClient: JobHttpClient;
	private _state: WorkerStatusCode = WorkerStatusCode.Active;

	constructor(httpClient: HttpClient, schedulerHttpUrl: string) {
		this._jobTracker = new JobTracker();
		this._jobHttpClient = new JobHttpClient(httpClient, schedulerHttpUrl);
	}

	registerHandler<TPayload = unknown>(
		jobType: JobType,
		handler: (job: {
			id: JobId;
			type: JobType;
			payload: TPayload;
		}) => Promise<unknown>
	): void {
		this._handlerRegistry.register(jobType, handler);
	}

	async onJobAssigned(
		job: SchedulerWsJobAssignedMessage["job"]
	): Promise<void> {
		if (this._state === WorkerStatusCode.Draining) {
			await this._jobHttpClient.failJob(job.id, "Worker is draining");
			return;
		}
		this._jobTracker.startJob(job);
		try {
			await this._jobHttpClient.ackJob(job.id);
			await this._executeHandler(job);
		} catch (err) {
			await this._failJobWithError(job, err);
		} finally {
			this._jobTracker.endJob(job.id);
		}
	}

	private async _executeHandler(
		job: SchedulerWsJobAssignedMessage["job"]
	): Promise<void> {
		const handler = this._handlerRegistry.get(job.type);
		if (!handler) {
			await this._jobHttpClient.failJob(
				job.id,
				`No handler registered for job type: ${job.type}`
			);
			return;
		}
		const result = await handler({
			id: job.id,
			type: job.type,
			payload: job.payload,
		});
		await this._jobHttpClient.completeJob(job.id, result);
	}

	private async _failJobWithError(
		job: SchedulerWsJobAssignedMessage["job"],
		err: unknown
	): Promise<void> {
		const errorMessage = err instanceof Error ? err.message : String(err);
		await this._jobHttpClient.failJob(job.id, errorMessage);
	}

	onDrain(): void {
		this._state = WorkerStatusCode.Draining;
	}

	stopAll(): void {
		this._jobTracker.stopAll();
	}

	get activeCount(): number {
		return this._jobTracker.activeCount;
	}

	get isDraining(): boolean {
		return this._state === WorkerStatusCode.Draining;
	}
}
