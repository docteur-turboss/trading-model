import { logger } from "@trading-model/common/config/logger";
import type { JobId, JobType } from "@trading-model/common/domain/primitives";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import { JobPriority } from "../types/job.types";
import type { IWorkerProtocol } from "../worker/worker-protocol";
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

export class JobScheduler {
	readonly queue: InternalQueue;
	readonly backPressure: BackPressure;
	readonly workers: WorkerRegistry;
	private readonly _lifecycle: JobLifecycle;
	private readonly _assignmentManager: JobAssignmentManager;
	private readonly _failureHandler: JobFailureHandler;
	private _workerProtocol?: IWorkerProtocol;

	constructor(repository: JobRepository) {
		this.queue = createInternalQueue();
		this.backPressure = createBackPressure();
		this.workers = createWorkerRegistry();
		this.repository = repository;
		this.reAllocator = createReAllocator(repository, this.queue);
		this._assignmentManager = createAssignmentManager(
			this.queue,
			this.backPressure,
			this.workers,
			repository
		);
		this._failureHandler = createFailureHandler(
			this.queue,
			repository,
			this.reAllocator,
			this._assignmentManager
		);
		this._lifecycle = new JobLifecycle(
			this.queue,
			this.backPressure,
			repository,
			this._assignmentManager,
			this._failureHandler
		);
		this.orphanDetector = createOrphanDetector(
			this.workers,
			repository,
			this.reAllocator
		);
	}

	setWorkerProtocol(protocol: IWorkerProtocol): void {
		this._workerProtocol = protocol;
		this._assignmentManager.setWorkerProtocol(protocol);
	}
	submit(
		type: JobType,
		payload: unknown,
		priority: JobPriority = JobPriority.MEDIUM,
		maxRetries: number = ENV.MAX_RETRIES_PER_JOB
	): Promise<string> {
		return this._lifecycle.submit(type, payload, priority, maxRetries);
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
		const nonTerminal = await this.repository.findNonTerminal();
		await recoverJobs(
			nonTerminal,
			this.queue,
			this.repository,
			this.reAllocator
		);
		this.backPressure.updateQueueDepth(this.queue.depth());
		logSchedulerStart(nonTerminal.length);
		this.orphanDetector.start();
	}
	stop(): void {
		this.orphanDetector.stop();
		this.queue.stop();
		this._workerProtocol?.close();
		logger.info("Audit job scheduler stopped");
	}
}
