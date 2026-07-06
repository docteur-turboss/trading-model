import { randomUUID } from "node:crypto";
import { HttpClient } from "../config/http-client";
import type { SchedulerWsJobAssignedMessage } from "../contracts/worker-protocol.types";
import type { TlsPemBundle } from "../domain/tls-paths";
import { WorkerClient, type WorkerClientConfig } from "./worker-client";

export interface BaseWorkerConfig {
	workerId?: string;
	serverUrl: string;
	schedulerHttpUrl: string;
	capabilities: string[];
	maxConcurrency: number;
	heartbeatIntervalMs?: number;
	tlsConfig?: TlsPemBundle;
}

export type JobHandler<TData = unknown> = (job: {
	id: string;
	type: string;
	payload: TData;
}) => Promise<unknown>;

interface ActiveJob {
	id: string;
	type: string;
	ackDeadline: number;
	timer: ReturnType<typeof setTimeout>;
}

export class BaseWorker {
	protected readonly client: WorkerClient;
	protected readonly httpClient: HttpClient;
	private readonly _handlers = new Map<string, JobHandler>();
	private readonly _activeJobs = new Map<string, ActiveJob>();
	private _drainRequested = false;
	private readonly _boundOnJobAssigned: (
		job: SchedulerWsJobAssignedMessage["job"]
	) => void;
	private readonly _boundOnDrain: () => void;

	constructor(protected readonly config: BaseWorkerConfig) {
		const workerId = config.workerId ?? `${this.constructor.name}-${randomUUID().slice(0, 8)}`;
		this.client = new WorkerClient(this._buildClientConfig(workerId));
		this.httpClient = new HttpClient(config.tlsConfig);
		this._boundOnJobAssigned = this._onJobAssigned.bind(this);
		this._boundOnDrain = this._onDrain.bind(this);
		this.client.on("job.assigned", this._boundOnJobAssigned);
		this.client.on("drain", this._boundOnDrain);
	}

	private _buildClientConfig(workerId: string): WorkerClientConfig {
		return {
			workerId,
			serverUrl: this.config.serverUrl,
			capabilities: this.config.capabilities,
			maxConcurrency: this.config.maxConcurrency,
			heartbeatIntervalMs: this.config.heartbeatIntervalMs,
		};
	}

	registerHandler<TPayload = unknown>(
		jobType: string,
		handler: JobHandler<TPayload>
	): void {
		this._handlers.set(jobType, handler as JobHandler);
	}

	async start(): Promise<void> {
		await this.client.connect();
	}

	stop(): void {
		for (const [, active] of this._activeJobs) {
			clearTimeout(active.timer);
		}
		this._activeJobs.clear();
		this.client.off("job.assigned", this._boundOnJobAssigned);
		this.client.off("drain", this._boundOnDrain);
		this.client.disconnect();
	}

	private async _onJobAssigned(
		job: SchedulerWsJobAssignedMessage["job"]
	): Promise<void> {
		if (this._drainRequested) {
			await this._failJob(job.id, "Worker is draining");
			return;
		}

		const remaining = job.ackDeadline - Date.now();
		const ackTimer = setTimeout(
			() => {
				this._activeJobs.delete(job.id);
			},
			Math.max(remaining, 0)
		);

		const activeJob: ActiveJob = {
			id: job.id,
			type: job.type,
			ackDeadline: job.ackDeadline,
			timer: ackTimer,
		};
		this._activeJobs.set(job.id, activeJob);

		try {
			await this._ackJob(job.id);

			const handler = this._handlers.get(job.type);
			if (!handler) {
				await this._failJob(
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
			await this._completeJob(job.id, result);
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			await this._failJob(job.id, errorMessage);
		} finally {
			clearTimeout(ackTimer);
			this._activeJobs.delete(job.id);
			this.client.sendHeartbeat(this._activeJobs.size);
		}
	}

	private async _ackJob(jobId: string): Promise<void> {
		await this.httpClient.post(
			`${this.config.schedulerHttpUrl}/jobs/${jobId}/ack`
		);
	}

	private async _completeJob(jobId: string, result: unknown): Promise<void> {
		await this.httpClient.post(
			`${this.config.schedulerHttpUrl}/jobs/${jobId}/complete`,
			{
				result,
			}
		);
	}

	private async _failJob(jobId: string, error: string): Promise<void> {
		await this.httpClient.post(
			`${this.config.schedulerHttpUrl}/jobs/${jobId}/fail`,
			{ error }
		);
	}

	private _onDrain(): void {
		this._drainRequested = true;
	}

	get activeJobCount(): number {
		return this._activeJobs.size;
	}

	get isDraining(): boolean {
		return this._drainRequested;
	}
}
