import { ScheduledJob } from "./scheduler";
import { TokenManager } from "../client/tokenManager";

/**
 * TokenRefresherJob
 *
 * Responsibility:
 * - Periodically refresh the authentication token
 *
 * Constraints:
 * - No retry logic
 * - No business logic
 * - No dependency on caching or service discovery mechanisms
 *
 * This job is intended to be scheduled via a scheduler and ensures
 * that the authentication token remains valid over time.
 */
export class TokenRefresherJob implements ScheduledJob {
  /**
   * Cron expression representing the refresh schedule.
   */
  public readonly schedule: string;

  private readonly tokenManager: TokenManager;

  /**
   * Creates a new TokenRefresherJob.
   *
   * @param tokenManager - Client responsible for token management.
   * @param refreshIntervalMs - Interval in milliseconds at which the token should be refreshed.
   *
   * @example
   * ```ts
   * const job = new TokenRefresherJob(tokenManager, 5 * 60_000); // every 5 minutes
   * scheduler.schedule(job);
   * ```
   */
  constructor(
    tokenManager: TokenManager,
    refreshIntervalMs: number
  ) {
    this.tokenManager = tokenManager;
    this.schedule = this.intervalMsToCron(refreshIntervalMs);
  }

  /**
   * Executes the token refresh.
   *
   * This method is called by the scheduler at the interval defined by `schedule`.
   * It delegates the refresh operation to the TokenManager.
   */
  async execute(): Promise<void> {
    await this.tokenManager.refreshToken();
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