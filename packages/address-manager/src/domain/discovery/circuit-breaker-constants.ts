import { DurationMs, PositiveInt } from "@trading-model/primitives/primitives";

/** Number of latency samples kept per endpoint. */
export const DEFAULT_LATENCY_WINDOW_SIZE = PositiveInt.of(100);
/** p99 latency above which an endpoint counts as slow, in milliseconds. */
export const DEFAULT_LATENCY_P99_THRESHOLD_MS = DurationMs.of(5000);
/** How long a loaded circuit breaker state stays cached, in milliseconds. */
/** Consecutive failures that open a circuit. */
export const DEFAULT_FAILURE_THRESHOLD = PositiveInt.of(3);
/** Time an open circuit waits before letting a trial call through, in milliseconds. */
export const DEFAULT_HALF_OPEN_TIMEOUT_MS = DurationMs.of(10_000);
