import type {
	JOB_STATUS,
	Job,
	JobUpdateExtras,
} from "../contracts/recovery.types";

export interface IJobRepository {
	findByWorker(workerId: string, statuses: JOB_STATUS[]): Promise<Job[]>;
	updateStatus(
		jobId: string,
		status: JOB_STATUS,
		extras?: JobUpdateExtras
	): Promise<void>;
}
