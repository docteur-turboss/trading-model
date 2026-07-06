import { randomUUID } from "node:crypto";
import { HttpClient } from "../config/http-client";
import type { SchedulerWsJobAssignedMessage } from "../contracts/worker-protocol.types";
import type { TlsPemBundle } from "../domain/tls-paths";
import { WorkerClient, type WorkerClientConfig } from "./worker-client";
import { ActiveJobManager } from "./active-job-manager";
import { JobHandlerRegistry } from "./job-handler-registry";

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

export class BaseWorker {
	protected readonly client: WorkerClient;
	protected readonly httpClient: HttpClient;
	private readonly _handlerRegistry = new JobHandlerRegistry();
	private readonly _jobManager: ActiveJobManager;
	private _drainRequested = false;
	private readonly _boundOnJobAssigned: (
		job: SchedulerWsJobAssignedMessage["job"]
	) => void;
	private readonly _boundOnDrain: () => void;

	constructor(protected readonly config: BaseWorkerConfig) {
		const workerId =
			config.workerId ?? `${this.constructor.name}-${randomUUID().slice(0, 8)}`;
		this.client = new WorkerClient(this._buildClientConfig(workerId));
		this.httpClient = new HttpClient(config.tlsConfig);
		this._jobManager = new ActiveJobManager(
			this.httpClient,
			this.config.schedulerHttpUrl
		);
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
		this._handlerRegistry.register(jobType, handler);
	}

	async start(): Promise<void> {
		await this.client.connect();
	}

	stop(): void {
		this._jobManager.stopAll();
		this.client.off("job.assigned", this._boundOnJobAssigned);
		this.client.off("drain", this._boundOnDrain);
		this.client.disconnect();
	}

	private async _onJobAssigned(
		job: SchedulerWsJobAssignedMessage["job"]
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
					`No handler registered for job type: ${job.type}`
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
			this.client.sendHeartbeat(this._jobManager.activeCount);
		}
	}

	private _onDrain(): void {
		this._drainRequested = true;
	}

	get activeJobCount(): number {
		return this._jobManager.activeCount;
	}

	get isDraining(): boolean {
		return this._drainRequested;
	}
}
