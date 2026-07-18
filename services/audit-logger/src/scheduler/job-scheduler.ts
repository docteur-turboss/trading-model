import { logger } from "@trading-model/common/config/logger";
import type { JobId } from "@trading-model/common/domain/primitives";
import type { OrphanDetector } from "@trading-model/common/recovery/orphan-detector";
import type { ReAllocator } from "@trading-model/common/recovery/re-allocator";
import type { JobRepository } from "../persistence/job-repository";
import type { SubmitJobParams } from "../types/job.types";
import type { IWorkerProtocol } from "../worker/worker-protocol";
import type { WorkerRegistry } from "../worker/worker-registry";
import type { BackPressure } from "./back-pressure";
import type { InternalQueue } from "./internal-queue";
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

export class JobScheduler {
	readonly queue: InternalQueue;
	readonly backPressure: BackPressure;
	readonly workers: WorkerRegistry;
	private readonly _repository: JobRepository;
	private readonly _reAllocator: ReAllocator;
	private readonly _assignmentManager: JobAssignmentManager;
	private readonly _failureHandler: JobFailureHandler;
	private readonly _orphanDetector: OrphanDetector;
	private readonly _lifecycle: JobLifecycle;
	private _workerProtocol?: IWorkerProtocol;

	constructor(repository: JobRepository) {
		this._repository = repository;
		this.queue = createInternalQueue();
		this.backPressure = createBackPressure();
		this.workers = createWorkerRegistry();
		this._reAllocator = createReAllocator(repository, this.queue);
		this._assignmentManager = createAssignmentManager(
			this.queue,
			this.backPressure,
			this.workers,
			repository
		);
		this._failureHandler = createFailureHandler(
			this.queue,
			repository,
			this._reAllocator,
			this._assignmentManager
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
		});
		this._orphanDetector = createOrphanDetector(
			this.workers,
			repository,
			this._reAllocator
		);
	}

	setWorkerProtocol(protocol: IWorkerProtocol): void {
		this._workerProtocol = protocol;
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
		await recoverJobs(
			nonTerminal,
			this.queue,
			this._repository,
			this._reAllocator
		);
		this.backPressure.updateQueueDepth(this.queue.depth());
		logSchedulerStart(nonTerminal.length);
		this._orphanDetector.start();
	}
	stop(): void {
		this._orphanDetector.stop();
		this.queue.stop();
		this._workerProtocol?.close();
		logger.info("Audit job scheduler stopped");
	}
}
