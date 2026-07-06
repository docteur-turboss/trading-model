/**
 * Circuit breaker states used across the system.
 *
 * - `closed` — normal operation
 * - `open` — failures threshold exceeded, rejecting requests
 * - `half-open` — probing whether the resource has recovered
 */
export enum CircuitState {
	CLOSED = "closed",
	OPEN = "open",
	HALF_OPEN = "half-open",
}

/** String union type for ergonomic type narrowing with `CircuitState` enum values. */
export type CircuitStateUnion = `${CircuitState}`;
