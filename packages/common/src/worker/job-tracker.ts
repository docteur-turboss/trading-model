import type { HttpClient } from "../config/http-client";
import type { SchedulerWsJobAssignedMessage } from "../contracts/worker-protocol.types";
import {
	type JobId,
	type JobType,
	type PositiveInt,
	URLString,
} from "../domain/primitives";
import { AckTimerManager } from "./ack-timer-manager";

interface ActiveJob {
	id: JobId;
	type: JobType;
	ackDeadline: PositiveInt;
}

function _toActiveJob(job: SchedulerWsJobAssignedMessage["job"]): ActiveJob {
	return {
		id: job.id,
		type: job.type,
		ackDeadline: job.ackDeadline,
	};
}

export class JobTracker {
	private readonly _activeJobs = new Map<string, ActiveJob>();
	private readonly _ackTimers = new AckTimerManager();

	startJob(job: SchedulerWsJobAssignedMessage["job"]): void {
		this._ackTimers.start(job.id, job.ackDeadline, () =>
			this._activeJobs.delete(job.id)
		);
		this._activeJobs.set(job.id, _toActiveJob(job));
	}

	endJob(jobId: JobId): void {
		const active = this._activeJobs.get(jobId);
		if (active) {
			this._ackTimers.clear(jobId);
			this._activeJobs.delete(jobId);
		}
	}

	stopAll(): void {
		this._ackTimers.clearAll();
		this._activeJobs.clear();
	}

	get activeCount(): number {
		return this._activeJobs.size;
	}
}

export class JobHttpClient {
	private readonly _httpClient: HttpClient;
	private readonly _schedulerHttpUrl: URLString;

	constructor(httpClient: HttpClient, schedulerHttpUrl: string) {
		this._httpClient = httpClient;
		this._schedulerHttpUrl = URLString.of(schedulerHttpUrl);
	}

	async ackJob(jobId: JobId): Promise<void> {
		await this._httpClient.post(
			URLString.of(`${this._schedulerHttpUrl}/jobs/${jobId}/ack`)
		);
	}

	async completeJob(jobId: JobId, result: unknown): Promise<void> {
		await this._httpClient.post(
			URLString.of(`${this._schedulerHttpUrl}/jobs/${jobId}/complete`),
			{ result }
		);
	}

	async failJob(jobId: JobId, error: string): Promise<void> {
		await this._httpClient.post(
			URLString.of(`${this._schedulerHttpUrl}/jobs/${jobId}/fail`),
			{ error }
		);
	}
}
