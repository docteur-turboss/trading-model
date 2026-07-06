/**
 * Circuit breaker states used across the system.
 *
 * - `closed` — normal operation
 * - `open` — failures threshold exceeded, rejecting requests
 * - `half-open` — probing whether the resource has recovered
 */
export type CircuitState = "closed" | "open" | "half-open";
