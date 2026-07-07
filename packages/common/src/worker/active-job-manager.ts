import type { HttpClient } from "../config/http-client";
import type { SchedulerWsJobAssignedMessage } from "../contracts/worker-protocol.types";

interface ActiveJob {
	id: string;
	type: string;
	ackDeadline: number;
	timer: ReturnType<typeof setTimeout>;
}

function _createAckTimer(
	jobId: string,
	ackDeadline: number,
	onTimeout: () => void
): ReturnType<typeof setTimeout> {
	const remaining = ackDeadline - Date.now();
	return setTimeout(onTimeout, Math.max(remaining, 0));
}

function _toActiveJob(
	job: SchedulerWsJobAssignedMessage["job"],
	timer: ReturnType<typeof setTimeout>
): ActiveJob {
	return {
		id: job.id,
		type: job.type,
		ackDeadline: job.ackDeadline,
		timer,
	};
}

export class JobTracker {
	private readonly _activeJobs = new Map<string, ActiveJob>();

	startJob(job: SchedulerWsJobAssignedMessage["job"]): void {
		const ackTimer = _createAckTimer(job.id, job.ackDeadline, () =>
			this._activeJobs.delete(job.id)
		);
		this._activeJobs.set(job.id, _toActiveJob(job, ackTimer));
	}

	endJob(jobId: string): void {
		const active = this._activeJobs.get(jobId);
		if (active) {
			clearTimeout(active.timer);
			this._activeJobs.delete(jobId);
		}
	}

	stopAll(): void {
		for (const [, active] of this._activeJobs) {
			clearTimeout(active.timer);
		}
		this._activeJobs.clear();
	}

	get activeCount(): number {
		return this._activeJobs.size;
	}
}

export class JobHttpClient {
	private readonly _httpClient: HttpClient;
	private readonly _schedulerHttpUrl: string;

	constructor(httpClient: HttpClient, schedulerHttpUrl: string) {
		this._httpClient = httpClient;
		this._schedulerHttpUrl = schedulerHttpUrl;
	}

	async ackJob(jobId: string): Promise<void> {
		await this._httpClient.post(`${this._schedulerHttpUrl}/jobs/${jobId}/ack`);
	}

	async completeJob(jobId: string, result: unknown): Promise<void> {
		await this._httpClient.post(
			`${this._schedulerHttpUrl}/jobs/${jobId}/complete`,
			{ result }
		);
	}

	async failJob(jobId: string, error: string): Promise<void> {
		await this._httpClient.post(
			`${this._schedulerHttpUrl}/jobs/${jobId}/fail`,
			{ error }
		);
	}
}

export class ActiveJobManager {
	private readonly _jobTracker: JobTracker;
	private readonly _jobHttpClient: JobHttpClient;

	constructor(httpClient: HttpClient, schedulerHttpUrl: string) {
		this._jobTracker = new JobTracker();
		this._jobHttpClient = new JobHttpClient(httpClient, schedulerHttpUrl);
	}

	startJob(job: SchedulerWsJobAssignedMessage["job"]): void {
		this._jobTracker.startJob(job);
	}

	endJob(jobId: string): void {
		this._jobTracker.endJob(jobId);
	}

	async ackJob(jobId: string): Promise<void> {
		await this._jobHttpClient.ackJob(jobId);
	}

	async completeJob(jobId: string, result: unknown): Promise<void> {
		await this._jobHttpClient.completeJob(jobId, result);
	}

	async failJob(jobId: string, error: string): Promise<void> {
		await this._jobHttpClient.failJob(jobId, error);
	}

	stopAll(): void {
		this._jobTracker.stopAll();
	}

	get activeCount(): number {
		return this._jobTracker.activeCount;
	}
}
