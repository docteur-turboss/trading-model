import { logger } from "@trading-model/common/config/logger";
import { JOB_STATUS } from "@trading-model/common/contracts/recovery.types";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import { OrphanDetector } from "../recovery/orphan-detector";
import { ReAllocator } from "../recovery/re-allocator";
import type { Job } from "../types/job.types";
import { WorkerRegistry } from "../worker/worker-registry";
import { BackPressure } from "./back-pressure";
import { InternalQueue } from "./internal-queue";
import { JobAssignmentManager } from "./job-assignment-manager";
import { JobFailureHandler } from "./job-failure-handler";

export function createInternalQueue(): InternalQueue {
	return new InternalQueue(ENV.ACK_TIMEOUT_MS);
}

export function createBackPressure(): BackPressure {
	return new BackPressure(ENV.MAX_QUEUE_DEPTH, ENV.MAX_WORKER_LOAD_RATIO);
}

export function createWorkerRegistry(): WorkerRegistry {
	return new WorkerRegistry(ENV.WORKER_HEARTBEAT_TTL_MS);
}

export function createReAllocator(
	repository: JobRepository,
	queue: InternalQueue
): ReAllocator {
	return new ReAllocator(repository, queue, ENV.ACK_TIMEOUT_MS);
}

export function createAssignmentManager(
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

export function createFailureHandler(
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

export function createOrphanDetector(
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

export async function recoverJobs(
	nonTerminal: Job[],
	queue: InternalQueue,
	repository: JobRepository,
	reAllocator: ReAllocator
): Promise<void> {
	const handlers = _buildRecoveryHandlers(queue, repository, reAllocator);
	for (const job of nonTerminal) {
		await handlers[job.status]?.(job);
	}
}

function _buildRecoveryHandlers(
	queue: InternalQueue,
	repository: JobRepository,
	reAllocator: ReAllocator
): Partial<Record<JOB_STATUS, (job: Job) => Promise<void>>> {
	return {
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
}

export function logSchedulerStart(recovered: number): void {
	logger.info("Job scheduler started — recovered jobs from persistence", {
		recovered,
	});
}
