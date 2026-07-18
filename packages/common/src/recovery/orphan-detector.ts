import { JobStatus as JOB_STATUS } from "@trading-model/validation/contracts/recovery.types";
import { logger } from "../config/logger";
import { TimerHandle } from "../utils/timer-handle";
import type { WorkerRegistry } from "../worker/worker-registry";
import type { IJobRepository } from "./job-repository.interface";
import type { ReAllocator } from "./re-allocator";

export interface OrphanDetectorDeps {
	workers: WorkerRegistry;
	repository: IJobRepository;
	reAllocator: ReAllocator;
	intervalMs: number;
}

export class OrphanDetector {
	private readonly _workers: WorkerRegistry;
	private readonly _repository: IJobRepository;
	private readonly _reAllocator: ReAllocator;
	private readonly _intervalMs: number;
	private readonly _intervalHandle = new TimerHandle();

	constructor(deps: OrphanDetectorDeps) {
		this._workers = deps.workers;
		this._repository = deps.repository;
		this._reAllocator = deps.reAllocator;
		this._intervalMs = deps.intervalMs;
	}

	start(): void {
		if (this._intervalHandle.isRunning) {
			return;
		}
		this._intervalHandle.startInterval(
			() => void this._runDetection(),
			this._intervalMs
		);
		logger.info("Orphan detector started", {
			context: { intervalMs: this._intervalMs },
		});
	}

	private async _runDetection(): Promise<void> {
		try {
			await this._detectOrphans();
		} catch (err) {
			logger.error("Orphan detection cycle failed", {
				context: {
					error: err instanceof Error ? err.message : String(err),
				},
			});
		}
	}

	stop(): void {
		this._intervalHandle.stop();
	}

	private async _processOrphanedWorker(workerId: string): Promise<void> {
		const orphanedJobs = await this._repository.findByWorker(workerId, [
			JOB_STATUS.ASSIGNED,
			JOB_STATUS.RUNNING,
		]);
		for (const job of orphanedJobs) {
			await this._repository.updateStatus(job.id, JOB_STATUS.ORPHANED);
			await this._reAllocator.reallocate(job);
		}
	}

	private async _detectOrphans(): Promise<void> {
		const staleWorkerIds = this._workers.healthMonitor.purgeStaleWorkers();
		if (staleWorkerIds.length === 0) {
			return;
		}
		logger.warn("Stale workers detected — scanning for orphaned jobs", {
			context: { workerCount: staleWorkerIds.length, workers: staleWorkerIds },
		});
		for (const workerId of staleWorkerIds) {
			await this._processOrphanedWorker(workerId);
		}
	}
}
