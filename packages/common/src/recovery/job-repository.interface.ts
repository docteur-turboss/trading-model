import type {
	Job,
	JobStatus,
	JobUpdateExtras,
} from "@trading-model/validation/contracts/recovery.types";

export interface IJobRepository {
	findByWorker(workerId: string, statuses: JobStatus[]): Promise<Job[]>;
	updateStatus(
		jobId: string,
		status: JobStatus,
		extras?: JobUpdateExtras
	): Promise<void>;
}
