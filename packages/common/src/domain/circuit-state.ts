/**
 * Circuit breaker states: closed (normal), open (failing), half-open (probing recovery).
 */
export enum CircuitState {
	CLOSED = "closed",
	OPEN = "open",
	HALF_OPEN = "half-open",
}
