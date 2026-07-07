import { logger } from "@trading-model/common/config/logger";
import { JOB_STATUS } from "@trading-model/common/contracts/recovery.types";
import type { WorkerRegistration } from "@trading-model/common/contracts/worker-protocol.types";
import {
	type JobId,
	toInstanceId,
} from "@trading-model/common/domain/primitives";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import type { Job } from "../types/job.types";
import {
	type IWorkerProtocol,
	NullWorkerProtocol,
} from "../worker/worker-protocol";
import type { BackPressure } from "./back-pressure";
import type { InternalQueue } from "./internal-queue";

export class JobAssigner {
	private _workerProtocol: IWorkerProtocol = new NullWorkerProtocol();

	constructor(
		private readonly _queue: InternalQueue,
		private readonly _backPressure: BackPressure,
		private readonly _repository: JobRepository
	) {}

	setWorkerProtocol(protocol: IWorkerProtocol): void {
		this._workerProtocol = protocol;
	}

	assign(
		queued: { job: Job },
		worker: Pick<
			WorkerRegistration,
			"workerId" | "currentLoad" | "maxConcurrency"
		>
	): void {
		const deadline = Date.now() + ENV.ACK_TIMEOUT_MS;
		const assignedJob: Job = {
			...queued.job,
			status: JOB_STATUS.ASSIGNED,
			assignedWorkerId: worker.workerId,
			ackDeadline: deadline,
		};

		this._queue.markDelivered(assignedJob.id);
		this._sendAssignment(worker.workerId, assignedJob, deadline);
		this._incrementWorkerLoad(worker);
		this._persistAssignment(assignedJob.id, worker.workerId, deadline);

		logger.info("Job assigned to worker", {
			context: {
				jobId: assignedJob.id,
				workerId: worker.workerId,
			},
		});
	}

	private _sendAssignment(workerId: string, job: Job, deadline: number): void {
		this._workerProtocol.sendToWorker(workerId, {
			type: "job.assigned",
			job: {
				id: job.id,
				type: job.type,
				payload: job.payload,
				ackDeadline: deadline,
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
			.updateStatus(jobId, JOB_STATUS.ASSIGNED, {
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
