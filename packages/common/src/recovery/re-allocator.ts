import { logger } from '../config/logger';
import { Job } from '../contracts/recovery.types';
import { IJobRepository } from './job-repository.interface';
import { IJobQueue } from './job-queue.interface';

export class ReAllocator {
  constructor(
    private readonly repository: IJobRepository,
    private readonly queue: IJobQueue,
    private readonly ackTimeoutMs: number
  ) {}

  async reallocate(job: Job): Promise<void> {
    if (job.retryCount >= job.maxRetries) {
      await this.repository.updateStatus(job.id, 'failed', {
        error: `Exceeded max retries (${job.maxRetries})`,
      });

      logger.warn('Job failed after max retries', {
        jobId: job.id,
        retryCount: job.retryCount,
      });
      return;
    }

    const newDeadline = Date.now() + this.ackTimeoutMs;
    const updatedJob: Job = {
      ...job,
      status: 'queued',
      ackDeadline: newDeadline,
      retryCount: job.retryCount + 1,
      assignedWorkerId: undefined,
      history: [
        ...job.history,
        {
          fromStatus: 'orphaned',
          toStatus: 'queued',
          timestamp: new Date(),
          reason: 're-allocated',
        },
      ],
    };

    this.queue.enqueue(updatedJob);
    await this.repository.updateStatus(job.id, 'queued', {
      ackDeadline: newDeadline,
    });

    logger.info('Job re-allocated to queue', {
      jobId: job.id,
      retryCount: updatedJob.retryCount,
    });
  }
}
