import { logger } from '@trading-model/common/config/logger';

import { ReAllocator } from './re-allocator';
import { JobRepository } from '../persistence/job-repository';
import { WorkerRegistry } from '../worker/worker-registry';

export class OrphanDetector {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly workers: WorkerRegistry,
    private readonly repository: JobRepository,
    private readonly reAllocator: ReAllocator,
    private readonly intervalMs: number
  ) {}

  start(): void {
    if (this.intervalHandle) return;

    this.intervalHandle = setInterval(async () => {
      try {
        await this.detectOrphans();
      } catch (err) {
        logger.error('Orphan detection cycle failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }, this.intervalMs);

    logger.info('Orphan detector started', { intervalMs: this.intervalMs });
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  private async detectOrphans(): Promise<void> {
    const staleWorkerIds = this.workers.purgeStaleWorkers();

    if (staleWorkerIds.length === 0) return;

    logger.warn('Stale workers detected — scanning for orphaned jobs', {
      workerCount: staleWorkerIds.length,
      workers: staleWorkerIds,
    });

    for (const workerId of staleWorkerIds) {
      const orphanedJobs = await this.repository.findByWorker(workerId, ['assigned', 'running']);

      for (const job of orphanedJobs) {
        await this.repository.updateStatus(job.id, 'orphaned');
        await this.reAllocator.reallocate(job);
      }
    }
  }
}
