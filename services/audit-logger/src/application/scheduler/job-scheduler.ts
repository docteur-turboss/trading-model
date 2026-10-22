import { getLogger } from "@trading-model/contracts/logger-registry";
import type { OrphanDetector } from "@trading-model/jobs/application/services/orphan-detector";
import type { ReAllocator } from "@trading-model/jobs/application/services/re-allocator";
import type { JobId } from "@trading-model/primitives/primitives";
import type { SubmitJobParams } from "../../domain/job.types";
import type { JobRepositoryPort } from "../../domain/ports/job-repository.port";
import type { WorkerProtocolPort } from "../../domain/ports/worker-protocol.port";
import type { BackPressure } from "../../domain/scheduler/back-pressure";
import type { InternalQueue } from "../../domain/scheduler/internal-queue";
import type { JobAssignmentManager } from "./job-assignment-manager";
import type { JobFailureHandler } from "./job-failure-handler";
import { JobLifecycle } from "./job-lifecycle";
import {
	createAssignmentManager,
	createBackPressure,
	createFailureHandler,
	createInternalQueue,
	createOrphanDetector,
	createReAllocator,
	createWorkerRegistry,
	logSchedulerStart,
	recoverJobs,
} from "./job-scheduler-factory";
import type { SchedulerConfig, SchedulerMetrics } from "./scheduler-config";
import type { WorkerRegistry } from "./worker-registry";

export interface JobSchedulerDeps {
	repository: JobRepositoryPort;
	config: SchedulerConfig;
	metrics?: SchedulerMetrics;
}

const NOOP_METRICS: SchedulerMetrics = { incOrphanJobs: () => {} };

export class JobScheduler {
	readonly queue: InternalQueue;
	readonly backPressure: BackPressure;
	readonly workers: WorkerRegistry;
	private readonly _repository: JobRepositoryPort;
	private readonly _reAllocator: ReAllocator;
	private readonly _assignmentManager: JobAssignmentManager;
	private readonly _failureHandler: JobFailureHandler;
	private readonly _orphanDetector: OrphanDetector;
	private readonly _lifecycle: JobLifecycle;
	private readonly _metrics: SchedulerMetrics;

	constructor({ repository, config, metrics }: JobSchedulerDeps) {
		this._repository = repository;
		this._metrics = metrics ?? NOOP_METRICS;
		this.queue = createInternalQueue(config);
		this.backPressure = createBackPressure(config);
		this.workers = createWorkerRegistry(config);
		this._reAllocator = createReAllocator(repository, this.queue, config);
		this._assignmentManager = createAssignmentManager(
			this.queue,
			this.backPressure,
			this.workers,
			repository,
			config
		);
		this._failureHandler = createFailureHandler(
			this.queue,
			repository,
			this._reAllocator,
			this._assignmentManager,
			config
		);
		this._assignmentManager.setOnAckTimeout(
			this._failureHandler.handleAckTimeout.bind(this._failureHandler)
		);
		this._lifecycle = new JobLifecycle({
			queue: this.queue,
			backPressure: this.backPressure,
			repository,
			assignmentManager: this._assignmentManager,
			failureHandler: this._failureHandler,
			logger: getLogger(),
			maxRetriesPerJob: config.maxRetriesPerJob,
			ackTimeoutMs: config.ackTimeoutMs,
		});
		this._orphanDetector = createOrphanDetector(
			this.workers,
			repository,
			this._reAllocator,
			config
		);
	}

	setWorkerProtocol(protocol: WorkerProtocolPort): void {
		this._assignmentManager.setWorkerProtocol(protocol);
	}
	submit(params: SubmitJobParams): Promise<string> {
		return this._lifecycle.submit(params);
	}
	ack(jobId: JobId): Promise<void> {
		return this._lifecycle.ack(jobId);
	}
	complete(jobId: JobId, result: unknown): Promise<void> {
		return this._lifecycle.complete(jobId, result);
	}
	fail(jobId: JobId, error: string): Promise<void> {
		return this._lifecycle.fail(jobId, error);
	}
	cancel(jobId: JobId): Promise<void> {
		return this._lifecycle.cancel(jobId);
	}
	onWorkerDisconnect(workerId: string): void {
		this.backPressure.removeWorker(workerId);
	}

	async start(): Promise<void> {
		const nonTerminal = await this._repository.findNonTerminal();
		await recoverJobs(nonTerminal, {
			queue: this.queue,
			repository: this._repository,
			reAllocator: this._reAllocator,
			metrics: this._metrics,
		});
		this.backPressure.updateQueueDepth(this.queue.depth());
		logSchedulerStart(nonTerminal.length);
		this._orphanDetector.start();
	}
	stop(): void {
		this._orphanDetector.stop();
		this.queue.stop();
		getLogger().info("Audit job scheduler stopped");
	}
}
