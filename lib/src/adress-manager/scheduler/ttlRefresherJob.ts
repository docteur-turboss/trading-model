import { ScheduledJob } from "./scheduler";
import { AddressManagerClient } from "../client/addressManagerClient";

/**
 * TtlRefresherJob
 *
 * Responsibility:
 * - Periodically refresh the TTL (Time-To-Live) of the registered service
 *
 * Constraints:
 * - No retry logic
 * - No business logic
 * - No dependency on caching or service discovery mechanisms
 *
 * This job is intended to be scheduled via a scheduler and ensures
 * the service registration remains active by periodically refreshing its TTL.
 */
export class TtlRefresherJob implements ScheduledJob {
  /**
   * Cron expression representing the refresh schedule.
   */
  public readonly schedule: string;

  private readonly addressManagerClient: AddressManagerClient;

  /**
   * Creates a new TtlRefresherJob.
   *
   * @param addressManagerClient - Client used to interact with the Address Manager.
   * @param refreshIntervalMs - Interval in milliseconds at which the TTL should be refreshed.
   *
   * @example
   * ```ts
   * const job = new TtlRefresherJob(addressManagerClient, 5 * 60_000); // every 5 minutes
   * scheduler.schedule(job);
   * ```
   */
  constructor(
    addressManagerClient: AddressManagerClient,
    refreshIntervalMs: number
  ) {
    this.addressManagerClient = addressManagerClient;
    this.schedule = this.intervalMsToCron(refreshIntervalMs);
  }

  /**
   * Executes the TTL refresh.
   *
   * This method is called by the scheduler at the interval defined by `schedule`.
   * It delegates the TTL refresh to the AddressManagerClient.
   */
  async execute(): Promise<void> {
    await this.addressManagerClient.refreshTTL();
  }

  /**
   * Converts a millisecond interval into a cron expression
   * compatible with node-cron.
   *
   * ⚠️ Deliberate limitation:
   * - Minute-level precision only.
   *
   * @param intervalMs - Interval in milliseconds.
   * @returns Cron expression string.
   *
   * @example
   * ```ts
   * const cronExpr = job.intervalMsToCron(300_000); // returns "*5 * * * *"
   * ```
   */
  private intervalMsToCron(intervalMs: number): string {
    const minutes = Math.max(1, Math.floor(intervalMs / 60000));
    return `*/${minutes} * * * *`;
  }
}