import { getLogger } from "@trading-model/contracts/logger-registry";
import { OrphanDetector } from "@trading-model/jobs/application/services/orphan-detector";
import { ReAllocator } from "@trading-model/jobs/application/services/re-allocator";
import { JobStatus } from "@trading-model/validation/domain/contracts/recovery.types";
import type { Job } from "../../domain/job.types";
import type { JobRepositoryPort } from "../../domain/ports/job-repository.port";
import { BackPressure } from "../../domain/scheduler/back-pressure";
import { InternalQueue } from "../../domain/scheduler/internal-queue";
import { JobAssignmentManager } from "./job-assignment-manager";
import { JobFailureHandler } from "./job-failure-handler";
import type { SchedulerConfig, SchedulerMetrics } from "./scheduler-config";
import type { WorkerRegistry } from "./worker-registry";
import { createWorkerRegistry as buildWorkerRegistry } from "./worker-registry";

export function createInternalQueue(config: SchedulerConfig): InternalQueue {
	return new InternalQueue(config.ackTimeoutMs);
}

export function createBackPressure(config: SchedulerConfig): BackPressure {
	return new BackPressure(config.maxQueueDepth, config.maxWorkerLoadRatio);
}

export function createWorkerRegistry(config: SchedulerConfig): WorkerRegistry {
	return buildWorkerRegistry(config.workerHeartbeatTtlMs);
}

export function createReAllocator(
	repository: JobRepositoryPort,
	queue: InternalQueue,
	config: SchedulerConfig
): ReAllocator {
	return new ReAllocator(repository, queue, config.ackTimeoutMs);
}

export function createAssignmentManager(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry,
	repository: JobRepositoryPort,
	config: SchedulerConfig
): JobAssignmentManager {
	return new JobAssignmentManager({
		queue,
		backPressure,
		workers,
		repository,
		ackTimeoutMs: config.ackTimeoutMs,
	});
}

export function createFailureHandler(
	queue: InternalQueue,
	repository: JobRepositoryPort,
	reAllocator: ReAllocator,
	assignmentManager: JobAssignmentManager,
	config: SchedulerConfig
): JobFailureHandler {
	return new JobFailureHandler({
		queue,
		repository,
		reAllocator,
		assignmentManager,
		logger: getLogger(),
		ackTimeoutMs: config.ackTimeoutMs,
	});
}

export function createOrphanDetector(
	workers: WorkerRegistry,
	repository: JobRepositoryPort,
	reAllocator: ReAllocator,
	config: SchedulerConfig
): OrphanDetector {
	return new OrphanDetector({
		workers,
		repository,
		reAllocator,
		intervalMs: config.orphanScanIntervalMs,
	});
}

export interface RecoveryDeps {
	queue: InternalQueue;
	repository: JobRepositoryPort;
	reAllocator: ReAllocator;
	metrics: SchedulerMetrics;
}

export async function recoverJobs(
	nonTerminal: Job[],
	deps: RecoveryDeps
): Promise<void> {
	const handlers = _buildRecoveryHandlers(deps);
	for (const job of nonTerminal) {
		await handlers[job.status]?.(job);
	}
}

function _buildRecoveryHandlers({
	queue,
	repository,
	reAllocator,
	metrics,
}: RecoveryDeps): Partial<Record<JobStatus, (job: Job) => Promise<void>>> {
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
			metrics.incOrphanJobs();
			await repository.updateStatus(job.id, JobStatus.ORPHANED);
			await reAllocator.reallocate(job);
		},
		[JobStatus.RUNNING]: async (job) => {
			metrics.incOrphanJobs();
			await repository.updateStatus(job.id, JobStatus.ORPHANED);
			await reAllocator.reallocate(job);
		},
		[JobStatus.ORPHANED]: async (job) => {
			metrics.incOrphanJobs();
			await reAllocator.reallocate(job);
		},
	};
}

export function logSchedulerStart(recovered: number): void {
	getLogger().info(
		"Job scheduler started and recovered jobs from persistence",
		{
			recovered,
		}
	);
}
