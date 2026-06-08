import cron, { ScheduledTask } from 'node-cron';

import { logger } from '@trading-model/common/config/logger';

/**
 * Minimal contract that a scheduled job must implement.
 * The Scheduler only knows this contract and interacts through it.
 */
export interface ScheduledJob {
  /**
   * Cron expression or interval compatible with node-cron.
   */
  readonly schedule: string;

  /**
   * Executed on every tick of the cron schedule.
   */
  execute(): Promise<void>;
}

/**
 * Scheduler
 *
 * Responsibilities:
 * - Register scheduled jobs
 * - Start and stop their execution cleanly
 *
 * Constraints:
 * - No business logic
 * - No access to caching or service discovery
 * - Does not know the content or behavior of the jobs
 *
 * This scheduler is a simple orchestrator that delegates execution to registered jobs.
 * Each job is responsible for its own error handling and robustness.
 */
export class Scheduler {
  private readonly tasks: ScheduledTask[] = [];
  private readonly jobs: ScheduledJob[] = [];
  private started = false;

  /**
   * Registers a scheduled job.
   *
   * @param job - Job to register
   * @throws Error if the scheduler has already been started
   *
   * @example
   * ```ts
   * const job = new RefreshJob(addressManagerClient, c => c.refreshTTL(), 5 * 60_000);
   * scheduler.register(job);
   * ```
   */
  register(job: ScheduledJob): void {
    if (this.started) {
      throw new Error('Cannot register job after scheduler has started');
    }

    this.jobs.push(job);
  }

  /**
   * Starts all registered jobs.
   *
   * Each job is scheduled according to its `schedule` property.
   * Errors thrown by jobs are logged via the global logger but do NOT halt the scheduler.
   * Jobs are expected to manage their own robustness; the logged error provides visibility
   * into unexpected failures.
   */
  start(): void {
    if (this.started) {
      return;
    }

    for (const job of this.jobs) {
      const task = cron.schedule(job.schedule, async () => {
        try {
          await job.execute();
        } catch (err) {
          logger.error('Job execution failed', {
            schedule: job.schedule,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });

      this.tasks.push(task);
    }

    this.started = true;
  }

  /**
   * Stops all scheduled jobs gracefully.
   *
   * Clears all internal references to allow proper cleanup.
   */
  stop(): void {
    for (const task of this.tasks) {
      task.stop();
    }

    this.tasks.length = 0;
    this.started = false;
  }
}
