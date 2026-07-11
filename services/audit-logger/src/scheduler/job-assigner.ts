import { logger } from "@trading-model/common/config/logger";
import { JobStatus } from "@trading-model/common/contracts/recovery.types";
import type { WorkerRegistration } from "@trading-model/common/contracts/worker-protocol.types";
import {
	type JobId,
	PositiveInt,
	toInstanceId,
} from "@trading-model/common/domain/primitives";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import type { Job } from "../types/job.types";
import type { IWorkerProtocol } from "../worker/worker-protocol";
import type { BackPressure } from "./back-pressure";
import type { InternalQueue } from "./internal-queue";

export class JobAssigner {
	private _workerProtocol?: IWorkerProtocol;
	private _onAckTimeout?: (jobId: JobId) => void;

	constructor(
		private readonly _queue: InternalQueue,
		private readonly _backPressure: BackPressure,
		private readonly _repository: JobRepository
	) {}

	setWorkerProtocol(protocol: IWorkerProtocol): void {
		this._workerProtocol = protocol;
	}

	setOnAckTimeout(handler: (jobId: JobId) => void): void {
		this._onAckTimeout = handler;
	}

	assign(
		queued: { job: Job },
		worker: Pick<WorkerRegistration, "workerId" | "currentLoad"> & {
			maxConcurrency: number;
		}
	): void {
		const deadline = Date.now() + ENV.ACK_TIMEOUT_MS;
		const assignedJob = this._buildAssignedJob(
			queued.job,
			worker.workerId,
			deadline
		);
		this._queue.markDelivered(assignedJob.id, this._onAckTimeout);
		this._sendAssignment(worker.workerId, assignedJob, deadline);
		this._incrementWorkerLoad(worker);
		this._persistAssignment(assignedJob.id, worker.workerId, deadline);
		logger.info("Job assigned to worker", {
			context: { jobId: assignedJob.id, workerId: worker.workerId },
		});
	}

	private _buildAssignedJob(
		job: Job,
		workerId: import("@trading-model/common/domain/primitives").InstanceId,
		deadline: number
	): Job {
		return {
			...job,
			status: JobStatus.ASSIGNED,
			assignedWorkerId: workerId,
			ackDeadline: PositiveInt.of(deadline),
		};
	}

	private _sendAssignment(workerId: string, job: Job, deadline: number): void {
		this._workerProtocol?.sendToWorker(workerId, {
			type: "job.assigned",
			job: {
				id: job.id,
				type: job.type,
				payload: job.payload,
				ackDeadline: PositiveInt.of(deadline),
			},
		});
	}

	private _incrementWorkerLoad(worker: {
		workerId: string;
		currentLoad: number;
		maxConcurrency: number;
	}): void {
		worker.currentLoad += 1;
		this._backPressure.updateWorkerLoad(
			worker.workerId,
			worker.currentLoad / worker.maxConcurrency
		);
	}

	private _persistAssignment(
		jobId: JobId,
		assignedWorkerId: string,
		deadline: number
	): void {
		this._repository
			.updateStatus(jobId, JobStatus.ASSIGNED, {
				assignedWorkerId: toInstanceId(assignedWorkerId),
				ackDeadline: PositiveInt.of(deadline),
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
