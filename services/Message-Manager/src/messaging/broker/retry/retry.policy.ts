export interface RetryPolicy {
  maxRetries: number;
  delayMs: number;
}