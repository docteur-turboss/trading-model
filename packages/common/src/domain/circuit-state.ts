/**
 * Circuit breaker states used across the system.
 *
 * - `closed` — normal operation
 * - `open` — failures threshold exceeded, rejecting requests
 * - `half-open` — probing whether the resource has recovered
 */
export type CircuitState = "closed" | "open" | "half-open";

/** Runtime enum-like constants for CircuitState values. */
export const CircuitState = {
	CLOSED: "closed" as const,
	OPEN: "open" as const,
	HALF_OPEN: "half-open" as const,
} as const satisfies Record<string, CircuitState>;
