import { logger } from "@trading-model/common/config/logger";
import { JOB_STATUS } from "@trading-model/common/contracts/recovery.types";
import type { JobId } from "@trading-model/common/domain/primitives";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import { OrphanDetector } from "../recovery/orphan-detector";
import { ReAllocator } from "../recovery/re-allocator";
import { type Job, JobPriority } from "../types/job.types";
import {
	type IWorkerProtocol,
	NullWorkerProtocol,
} from "../worker/worker-protocol";
import { WorkerRegistry } from "../worker/worker-registry";
import { BackPressure } from "./back-pressure";
import { InternalQueue } from "./internal-queue";
import { JobAssignmentManager } from "./job-assignment-manager";
import { JobFailureHandler } from "./job-failure-handler";
import { JobLifecycle } from "./job-lifecycle";

function _createInternalQueue(): InternalQueue {
	return new InternalQueue(ENV.ACK_TIMEOUT_MS);
}

function _createBackPressure(): BackPressure {
	return new BackPressure(ENV.MAX_QUEUE_DEPTH, ENV.MAX_WORKER_LOAD_RATIO);
}

function _createWorkerRegistry(): WorkerRegistry {
	return new WorkerRegistry(ENV.WORKER_HEARTBEAT_TTL_MS);
}

function _createReAllocator(
	repository: JobRepository,
	queue: InternalQueue
): ReAllocator {
	return new ReAllocator(repository, queue, ENV.ACK_TIMEOUT_MS);
}

function _createAssignmentManager(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry,
	repository: JobRepository
): JobAssignmentManager {
	return new JobAssignmentManager({
		queue,
		backPressure,
		workers,
		repository,
	});
}

function _createFailureHandler(
	queue: InternalQueue,
	repository: JobRepository,
	reAllocator: ReAllocator,
	assignmentManager: JobAssignmentManager
): JobFailureHandler {
	return new JobFailureHandler({
		queue,
		repository,
		reAllocator,
		assignmentManager,
	});
}

function _createOrphanDetector(
	workers: WorkerRegistry,
	repository: JobRepository,
	reAllocator: ReAllocator
): OrphanDetector {
	return new OrphanDetector({
		workers,
		repository,
		reAllocator,
		intervalMs: ENV.ORPHAN_SCAN_INTERVAL_MS,
	});
}

async function _recoverJobs(
	nonTerminal: Job[],
	queue: InternalQueue,
	repository: JobRepository,
	reAllocator: ReAllocator
): Promise<void> {
	const StatusHandlers: Partial<
		Record<JOB_STATUS, (job: Job) => Promise<void>>
	> = {
		[JOB_STATUS.PENDING]: async (job) => {
			queue.enqueue({ ...job, status: JOB_STATUS.QUEUED });
		},
		[JOB_STATUS.QUEUED]: async (job) => {
			queue.enqueue({ ...job, status: JOB_STATUS.QUEUED });
		},
		[JOB_STATUS.ASSIGNED]: async (job) => {
			await repository.updateStatus(job.id, JOB_STATUS.ORPHANED);
			await reAllocator.reallocate(job);
		},
		[JOB_STATUS.RUNNING]: async (job) => {
			await repository.updateStatus(job.id, JOB_STATUS.ORPHANED);
			await reAllocator.reallocate(job);
		},
		[JOB_STATUS.ORPHANED]: async (job) => {
			await reAllocator.reallocate(job);
		},
	};

	for (const job of nonTerminal) {
		await StatusHandlers[job.status]?.(job);
	}
}

function _logSchedulerStart(recovered: number): void {
	logger.info("Job scheduler started — recovered jobs from persistence", {
		recovered,
	});
}

export class JobScheduler {
	readonly queue: InternalQueue;
	readonly backPressure: BackPressure;
	readonly workers: WorkerRegistry;
	readonly repository: JobRepository;
	readonly reAllocator: ReAllocator;
	readonly orphanDetector: OrphanDetector;
	private readonly _lifecycle: JobLifecycle;
	private readonly _assignmentManager: JobAssignmentManager;
	private readonly _failureHandler: JobFailureHandler;
	private _workerProtocol: IWorkerProtocol = new NullWorkerProtocol();

	constructor(repository: JobRepository) {
		this.queue = _createInternalQueue();
		this.backPressure = _createBackPressure();
		this.workers = _createWorkerRegistry();
		this.repository = repository;
		this.reAllocator = _createReAllocator(repository, this.queue);
		this._assignmentManager = _createAssignmentManager(
			this.queue,
			this.backPressure,
			this.workers,
			repository
		);
		this._failureHandler = _createFailureHandler(
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
		this.orphanDetector = _createOrphanDetector(
			this.workers,
			repository,
			this.reAllocator
		);
	}

	setWorkerProtocol(protocol: IWorkerProtocol): void {
		this._workerProtocol = protocol;
		this._assignmentManager.setWorkerProtocol(protocol);
	}

	async submit(
		type: string,
		payload: unknown,
		priority: JobPriority = JobPriority.MEDIUM,
		maxRetries: number = ENV.MAX_RETRIES_PER_JOB
	): Promise<string> {
		return this._lifecycle.submit(type, payload, priority, maxRetries);
	}

	async ack(jobId: JobId): Promise<void> {
		return this._lifecycle.ack(jobId);
	}

	async complete(jobId: JobId, result: unknown): Promise<void> {
		return this._lifecycle.complete(jobId, result);
	}

	async fail(jobId: JobId, error: string): Promise<void> {
		return this._lifecycle.fail(jobId, error);
	}

	async cancel(jobId: JobId): Promise<void> {
		return this._lifecycle.cancel(jobId);
	}

	onWorkerDisconnect(workerId: string): void {
		this.backPressure.removeWorker(workerId);
	}

	async start(): Promise<void> {
		const nonTerminal = await this.repository.findNonTerminal();

		await _recoverJobs(
			nonTerminal,
			this.queue,
			this.repository,
			this.reAllocator
		);
		this.backPressure.updateQueueDepth(this.queue.depth());

		_logSchedulerStart(nonTerminal.length);
		this.orphanDetector.start();
	}

	stop(): void {
		this.orphanDetector.stop();
		this.queue.stop();
		this._workerProtocol.close();

		logger.info("Audit job scheduler stopped");
	}
}
