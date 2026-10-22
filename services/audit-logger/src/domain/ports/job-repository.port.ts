import type { InstanceId, JobId } from "@trading-model/primitives/primitives";
import type {
	JobStatus,
	JobUpdateExtras,
} from "@trading-model/validation/domain/contracts/recovery.types";
import type { Job } from "../job.types";

/** Job persistence the scheduler depends on (implemented by the Mongo JobRepository). */
export interface JobRepositoryPort {
	insert(job: Job): Promise<void>;
	findById(id: string): Promise<Job | null>;
	updateStatus(
		jobId: JobId,
		status: JobStatus,
		extras?: JobUpdateExtras
	): Promise<void>;
	incrementRetry(jobId: JobId): Promise<void>;
	findNonTerminal(): Promise<Job[]>;
	findByWorker(workerId: InstanceId, statuses: JobStatus[]): Promise<Job[]>;
}
