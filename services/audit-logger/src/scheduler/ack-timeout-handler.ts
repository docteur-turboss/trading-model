import { logger } from "@trading-model/common/config/logger";
import { isTerminalStatus } from "@trading-model/common/contracts/recovery.types";
import { toInstanceId } from "@trading-model/common/domain/primitives";
import type { JobRepository } from "../persistence/job-repository";
import type { ReAllocator } from "../recovery/re-allocator";
import type { Job } from "../types/job.types";
import type { WorkerRegistry } from "../worker/worker-registry";
import type { BackPressure } from "./back-pressure";

export class AckTimeoutHandler {
	constructor(
		private readonly _repository: JobRepository,
		private readonly _workers: WorkerRegistry,
		private readonly _backPressure: BackPressure,
		private readonly _reAllocator: ReAllocator
	) {}

	onTimeout(jobId: string): void {
		logger.warn("ACK timeout for job", { context: { jobId } });

		this._repository
			.findById(jobId)
			.then((job) => this._onJobFound(job, jobId))
			.catch((err) => {
				logger.error("Failed to find job on ACK timeout", {
					context: {
						jobId,
						error: String(err),
					},
				});
			});
	}

	private _onJobFound(job: Job | null, jobId: string): void {
		if (!job || isTerminalStatus(job.status)) {
			return;
		}

		this._decrementWorkerLoad(job.assignedWorkerId);

		this._repository
			.updateStatus(jobId, "orphaned")
			.then(() => this._reAllocator.reallocate(job))
			.catch((err) => {
				logger.error("Failed to persist orphaned status on ACK timeout", {
					jobId,
					error: String(err),
				});
			});
	}

	private _decrementWorkerLoad(workerId: string | undefined): void {
		if (!workerId) {
			return;
		}
		const worker = this._workers.get(workerId);
		if (!worker) {
			return;
		}
		worker.currentLoad = Math.max(0, worker.currentLoad - 1);
		this._backPressure.updateWorkerLoad(
			workerId,
			worker.currentLoad / worker.maxConcurrency
		);
	}

	persistAssignment(
		jobId: string,
		assignedWorkerId: string,
		deadline: number
	): void {
		this._repository
			.updateStatus(jobId, "assigned", {
				assignedWorkerId: toInstanceId(assignedWorkerId),
				ackDeadline: deadline,
			})
			.catch((err) => {
				logger.error("Failed to persist assigned status", {
					context: {
						jobId,
						error: String(err),
					},
				});
			});
	}
}
