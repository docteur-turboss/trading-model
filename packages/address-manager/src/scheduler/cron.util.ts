/**
 * Convert a millisecond interval into a cron expression compatible
 * with node-cron. Sub-minute intervals use seconds-level precision
 * (6-field format); minute and above use minute-level precision
 * (5-field format).
 *
 * @param intervalMs - Interval in milliseconds.
 * @returns Cron expression string compatible with node-cron.
 */
export function intervalMsToCron(intervalMs: number): string {
  if (intervalMs < 60_000) {
    const seconds = Math.max(1, Math.round(intervalMs / 1_000));
    return `*/${seconds} * * * * *`;
  }

  const minutes = Math.floor(intervalMs / 60_000);
  return `*/${minutes} * * * *`;
}
