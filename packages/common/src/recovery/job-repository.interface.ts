import { Job, JobStatus } from '../contracts/recovery.types';

export interface IJobRepository {
  findByWorker(workerId: string, statuses: JobStatus[]): Promise<Job[]>;
  updateStatus(
    jobId: string,
    status: JobStatus,
    extras?: Partial<Pick<Job, 'result' | 'error' | 'assignedWorkerId' | 'ackDeadline'>>
  ): Promise<void>;
}
