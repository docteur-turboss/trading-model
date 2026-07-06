import { HttpClient } from "../config/http-client";
import type { SchedulerWsJobAssignedMessage } from "../contracts/worker-protocol.types";
import { ActiveJobManager } from "./active-job-manager";
import { JobHandlerRegistry } from "./job-handler-registry";

export class JobAssignmentHandler {
	private readonly _handlerRegistry = new JobHandlerRegistry();
	private readonly _jobManager: ActiveJobManager;
	private _drainRequested = false;

	constructor(httpClient: HttpClient, schedulerHttpUrl: string) {
		this._jobManager = new ActiveJobManager(httpClient, schedulerHttpUrl);
	}

	registerHandler<TPayload = unknown>(
		jobType: string,
		handler: (job: {
			id: string;
			type: string;
			payload: TPayload;
		}) => Promise<unknown>,
	): void {
		this._handlerRegistry.register(jobType, handler);
	}

	async onJobAssigned(
		job: SchedulerWsJobAssignedMessage["job"],
	): Promise<void> {
		if (this._drainRequested) {
			await this._jobManager.failJob(job.id, "Worker is draining");
			return;
		}
		this._jobManager.startJob(job);
		try {
			await this._jobManager.ackJob(job.id);
			const handler = this._handlerRegistry.get(job.type);
			if (!handler) {
				await this._jobManager.failJob(
					job.id,
					`No handler registered for job type: ${job.type}`,
				);
				return;
			}
			const result = await handler({
				id: job.id,
				type: job.type,
				payload: job.payload,
			});
			await this._jobManager.completeJob(job.id, result);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			await this._jobManager.failJob(job.id, errorMessage);
		} finally {
			this._jobManager.endJob(job.id);
		}
	}

	onDrain(): void {
		this._drainRequested = true;
	}

	stopAll(): void {
		this._jobManager.stopAll();
	}

	get activeCount(): number {
		return this._jobManager.activeCount;
	}

	get isDraining(): boolean {
		return this._drainRequested;
	}
}
