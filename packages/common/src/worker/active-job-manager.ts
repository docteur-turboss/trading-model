import type { HttpClient } from "../config/http-client";
import type { SchedulerWsJobAssignedMessage } from "../contracts/worker-protocol.types";

interface ActiveJob {
	id: string;
	type: string;
	ackDeadline: number;
	timer: ReturnType<typeof setTimeout>;
}

export class ActiveJobManager {
	private readonly _activeJobs = new Map<string, ActiveJob>();
	private readonly _httpClient: HttpClient;
	private readonly _schedulerHttpUrl: string;

	constructor(httpClient: HttpClient, schedulerHttpUrl: string) {
		this._httpClient = httpClient;
		this._schedulerHttpUrl = schedulerHttpUrl;
	}

	startJob(job: SchedulerWsJobAssignedMessage["job"]): void {
		const remaining = job.ackDeadline - Date.now();
		const ackTimer = setTimeout(
			() => {
				this._activeJobs.delete(job.id);
			},
			Math.max(remaining, 0)
		);

		this._activeJobs.set(job.id, {
			id: job.id,
			type: job.type,
			ackDeadline: job.ackDeadline,
			timer: ackTimer,
		});
	}

	endJob(jobId: string): void {
		const active = this._activeJobs.get(jobId);
		if (active) {
			clearTimeout(active.timer);
			this._activeJobs.delete(jobId);
		}
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
