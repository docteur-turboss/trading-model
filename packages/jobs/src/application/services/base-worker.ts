import { randomUUID } from "node:crypto";
import type {
	Capability,
	DurationMs,
	JobType,
	PositiveInt,
} from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { JobAssignmentHandler } from "./job-assignment-handler";
import type { JobHandler } from "./job-handler-registry";
import { WorkerClient, type WorkerClientConfig } from "./worker-client";

export interface BaseWorkerConfig {
	workerId?: string;
	serverUrl: string;
	schedulerHttpUrl: string;
	capabilities: Capability[];
	maxConcurrency: PositiveInt;
	heartbeatIntervalMs?: DurationMs;
	tlsConfig?: Partial<TlsPaths>;
}

export class BaseWorker {
	protected readonly client: WorkerClient;
	protected readonly httpClient: HttpClient;
	private readonly _jobHandler: JobAssignmentHandler;

	constructor(protected readonly config: BaseWorkerConfig) {
		const workerId =
			config.workerId ?? `${this.constructor.name}-${randomUUID().slice(0, 8)}`;
		this.client = new WorkerClient(this._buildClientConfig(workerId));
		this.httpClient = new HttpClient(config.tlsConfig);
		this._jobHandler = new JobAssignmentHandler(
			this.httpClient,
			this.config.schedulerHttpUrl
		);
		this.client.on("job.assigned", (job) => void this._onJobAssigned(job));
		this.client.on("drain", () => this._jobHandler.onDrain());
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
		jobType: JobType,
		handler: JobHandler<TPayload>
	): void {
		this._jobHandler.registerHandler(jobType, handler);
	}

	async start(): Promise<void> {
		await this.client.connect();
	}

	stop(): void {
		this._jobHandler.stopAll();
		this.client.disconnect();
	}

	private async _onJobAssigned(
		job: import("@trading-model/common/contracts/worker-protocol-types").SchedulerWsJobAssignedMessage["job"]
	): Promise<void> {
		await this._jobHandler.onJobAssigned(job);
		this.client.sendHeartbeat(this._jobHandler.activeCount);
	}

	get activeJobCount(): number {
		return this._jobHandler.activeCount;
	}

	get isDraining(): boolean {
		return this._jobHandler.isDraining;
	}
}
