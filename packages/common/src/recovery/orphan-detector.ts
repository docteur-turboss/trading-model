import { logger } from "../config/logger";
import type { WorkerRegistry } from "../worker/worker-registry";
import type { IJobRepository } from "./job-repository.interface";
import type { ReAllocator } from "./re-allocator";

export class OrphanDetector {
	private _intervalHandle: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly _workers: WorkerRegistry,
		private readonly _repository: IJobRepository,
		private readonly _reAllocator: ReAllocator,
		private readonly _intervalMs: number
	) {}

	start(): void {
		if (this._intervalHandle) {
			return;
		}

		this._intervalHandle = setInterval(async () => {
			try {
				await this._detectOrphans();
			} catch (err) {
				logger.error("Orphan detection cycle failed", {
					context: {
						error: err instanceof Error ? err.message : String(err),
					},
				});
			}
		}, this._intervalMs);

		logger.info("Orphan detector started", { context: { intervalMs: this._intervalMs } });
	}

	stop(): void {
		if (this._intervalHandle) {
			clearInterval(this._intervalHandle);
			this._intervalHandle = null;
		}
	}

	private async _detectOrphans(): Promise<void> {
		const staleWorkerIds = this._workers.purgeStaleWorkers();

		if (staleWorkerIds.length === 0) {
			return;
		}

		logger.warn("Stale workers detected — scanning for orphaned jobs", {
			workerCount: staleWorkerIds.length,
			workers: staleWorkerIds,
		});

		for (const workerId of staleWorkerIds) {
			const orphanedJobs = await this._repository.findByWorker(workerId, [
				"assigned",
				"running",
			]);

			for (const job of orphanedJobs) {
				await this._repository.updateStatus(job.id, "orphaned");
				await this._reAllocator.reallocate(job);
			}
		}
	}
}
