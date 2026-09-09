import { logger } from "@trading-model/common/config/logger";
import { OrphanDetector } from "@trading-model/common/recovery/orphan-detector";
import { ReAllocator } from "@trading-model/common/recovery/re-allocator";
import { JobStatus } from "@trading-model/validation/domain/contracts/recovery.types";
import { JobFailureHandler } from "../domain/scheduler/job-failure-handler";
import { ENV } from "../infrastructure/config/env";
import type { JobRepository } from "../persistence/job-repository";
import type { Job } from "../types/job.types";
import type { WorkerRegistry } from "../worker/worker-registry";
import { createWorkerRegistry as buildWorkerRegistry } from "../worker/worker-registry";
import { BackPressure } from "./back-pressure";
import { InternalQueue } from "./internal-queue";
import { JobAssignmentManager } from "./job-assignment-manager";

export function createInternalQueue(): InternalQueue {
	return new InternalQueue(ENV.ACK_TIMEOUT_MS);
}

export function createBackPressure(): BackPressure {
	return new BackPressure(ENV.MAX_QUEUE_DEPTH, ENV.MAX_WORKER_LOAD_RATIO);
}

export function createWorkerRegistry(): WorkerRegistry {
	return buildWorkerRegistry(ENV.WORKER_HEARTBEAT_TTL_MS);
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
): Partial<Record<JobStatus, (job: Job) => Promise<void>>> {
	return {
		[JobStatus.PENDING]: (job) => {
			queue.enqueue({ ...job, status: JobStatus.QUEUED });
			return Promise.resolve();
		},
		[JobStatus.QUEUED]: (job) => {
			queue.enqueue({ ...job, status: JobStatus.QUEUED });
			return Promise.resolve();
		},
		[JobStatus.ASSIGNED]: async (job) => {
			await repository.updateStatus(job.id, JobStatus.ORPHANED);
			await reAllocator.reallocate(job);
		},
		[JobStatus.RUNNING]: async (job) => {
			await repository.updateStatus(job.id, JobStatus.ORPHANED);
			await reAllocator.reallocate(job);
		},
		[JobStatus.ORPHANED]: async (job) => {
			await reAllocator.reallocate(job);
		},
	};
}

export function logSchedulerStart(recovered: number): void {
	logger.info("Job scheduler started and recovered jobs from persistence", {
		recovered,
	});
}
