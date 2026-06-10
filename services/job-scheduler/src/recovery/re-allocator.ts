import { logger } from '@trading-model/common/config/logger';

import { env } from '../config/env';
import { InternalQueue } from '../scheduler/internal-queue';
import { Job } from '../types/job.types';
import { JobRepository } from '../persistence/job-repository';

export class ReAllocator {
  constructor(
    private readonly repository: JobRepository,
    private readonly queue: InternalQueue,
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

    const newDeadline = Date.now() + env.ACK_TIMEOUT_MS;
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
