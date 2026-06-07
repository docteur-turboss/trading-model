/**
 * Convert a millisecond interval into a minute-level cron expression
 * compatible with node-cron.
 *
 * Deliberate limitation: minute-level precision only. Intervals shorter
 * than one minute are rounded up to one minute.
 *
 * @param intervalMs - Interval in milliseconds.
 * @returns Cron expression string compatible with node-cron.
 */
export function intervalMsToCron(intervalMs: number): string {
  const minutes = Math.max(1, Math.floor(intervalMs / 60_000));
  return `*/${minutes} * * * *`;
}
