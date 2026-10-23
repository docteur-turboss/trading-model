import { getLogger } from "@trading-model/contracts/logger-registry";
import { JobStatus } from "@trading-model/contracts/recovery-types";
import type { WorkerRegistration } from "@trading-model/contracts/worker-protocol-types";
import {
	type InstanceId,
	type JobId,
	PositiveInt,
	toInstanceId,
} from "@trading-model/primitives/primitives";
import type { Job } from "../../domain/job.types";
import type { JobRepositoryPort } from "../../domain/ports/job-repository.port";
import type { WorkerProtocolPort } from "../../domain/ports/worker-protocol.port";
import type { BackPressure } from "../../domain/scheduler/back-pressure";
import type { InternalQueue } from "../../domain/scheduler/internal-queue";

interface JobAssignment {
	job: Job;
	workerId: InstanceId;
	deadline: number;
}

class NullWorkerProtocol implements WorkerProtocolPort {
	sendToWorker(): void {}
	sendDrain(): void {}
	broadcastDrain(): void {}
	close(): void {}
}

export class JobAssigner {
	private _workerProtocol: WorkerProtocolPort = new NullWorkerProtocol();
	private _onAckTimeout: (jobId: JobId) => void = () => {};

	constructor(
		private readonly _queue: InternalQueue,
		private readonly _backPressure: BackPressure,
		private readonly _repository: JobRepositoryPort,
		private readonly _ackTimeoutMs: number
	) {}

	setWorkerProtocol(protocol: WorkerProtocolPort): void {
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
		const assignment: JobAssignment = {
			job: queued.job,
			workerId: worker.workerId,
			deadline: Date.now() + this._ackTimeoutMs,
		};
		const assignedJob = this._buildAssignedJob(assignment);
		this._queue.markDelivered(assignedJob.id, this._onAckTimeout);
		this._sendAssignment(assignment, assignedJob);
		this._incrementWorkerLoad(worker);
		this._persistAssignment(assignment, assignedJob);
		getLogger().info("Job assigned to worker", {
			context: { jobId: assignedJob.id, workerId: assignment.workerId },
		});
	}

	private _buildAssignedJob(assignment: JobAssignment): Job {
		return {
			...assignment.job,
			status: JobStatus.ASSIGNED,
			assignedWorkerId: assignment.workerId,
			ackDeadline: PositiveInt.of(assignment.deadline),
		};
	}

	private _sendAssignment(assignment: JobAssignment, job: Job): void {
		this._workerProtocol.sendToWorker(assignment.workerId, {
			type: "job.assigned",
			job: {
				id: job.id,
				type: job.type,
				payload: job.payload,
				ackDeadline: PositiveInt.of(assignment.deadline),
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

	private _persistAssignment(assignment: JobAssignment, job: Job): void {
		this._repository
			.updateStatus(job.id, JobStatus.ASSIGNED, {
				assignedWorkerId: toInstanceId(assignment.workerId),
				ackDeadline: PositiveInt.of(assignment.deadline),
			})
			.catch((err) => {
				getLogger().error("Failed to persist assigned status", {
					context: {
						jobId: job.id,
						error: String(err),
					},
				});
			});
	}
}
