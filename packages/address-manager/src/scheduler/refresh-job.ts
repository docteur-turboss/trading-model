import { ScheduledJob } from './scheduler';

/**
 * Parameterized scheduled job that periodically executes a refresh function
 * against a client instance.
 *
 * Replaces previously duplicated TokenRefresherJob and TtlRefresherJob.
 *
 * @template T - Client type used by the refresh function.
 */
export class RefreshJob<T> implements ScheduledJob {
  /**
   * Cron expression representing the refresh schedule.
   */
  public readonly schedule: string;

  private readonly client: T;

  private readonly executeFn: (client: T) => Promise<void>;

  /**
   * Creates a new RefreshJob.
   *
   * @param client - Client instance used during execution.
   * @param executeFn - Function invoked on every schedule tick, receives the client.
   * @param refreshIntervalMs - Interval in milliseconds at which the refresh should run.
   */
  constructor(client: T, executeFn: (client: T) => Promise<void>, refreshIntervalMs: number) {
    this.client = client;
    this.executeFn = executeFn;
    this.schedule = this.intervalMsToCron(refreshIntervalMs);
  }

  /**
   * Executes the registered refresh function.
   *
   * Called by the scheduler at the interval defined by `schedule`.
   */
  async execute(): Promise<void> {
    await this.executeFn(this.client);
  }

  /**
   * Converts a millisecond interval into a cron expression
   * compatible with node-cron.
   *
   * Deliberate limitation: minute-level precision only.
   *
   * @param intervalMs - Interval in milliseconds.
   * @returns Cron expression string.
   */
  private intervalMsToCron(intervalMs: number): string {
    const minutes = Math.max(1, Math.floor(intervalMs / 60000));
    return `*/${minutes} * * * *`;
  }
}
